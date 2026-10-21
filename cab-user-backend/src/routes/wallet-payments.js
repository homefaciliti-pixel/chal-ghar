const router=require('express').Router();
const auth=require('../middleware/auth'),db=require('../config/db');
const {ok,fail,id,asyncHandler}=require('../utils/http');
const crypto=require('crypto');
const Razorpay=require('razorpay');
function gateway(){if(!process.env.RAZORPAY_KEY_ID||!process.env.RAZORPAY_KEY_SECRET)throw Object.assign(new Error('Razorpay credentials are not configured'),{status:503,code:'PAYMENT_GATEWAY_NOT_CONFIGURED'});return new Razorpay({key_id:process.env.RAZORPAY_KEY_ID,key_secret:process.env.RAZORPAY_KEY_SECRET});}
async function createOrder({userId,rideId,purpose,method,amount,res}) {
 if(!Number.isFinite(amount)||amount<=0)return fail(res,422,'Amount must be greater than zero','INVALID_AMOUNT');
 const order=await gateway().orders.create({amount:Math.round(amount*100),currency:'INR',receipt:id('rcpt').slice(0,40),notes:{user_id:String(userId),ride_id:rideId||'',purpose}});
 const paymentRef=id('payref');
 await db.query('INSERT INTO payments (payment_ref,user_id,ride_id,purpose,payment_method,gateway_order_id,amount,status) VALUES (?,?,?,?,?,?,?,?)',[paymentRef,userId,rideId||null,purpose,method,order.id,amount,'CREATED']);
 return ok(res,{gateway:'RAZORPAY',gateway_order_id:order.id,amount,currency:'INR',gateway_key:process.env.RAZORPAY_KEY_ID,payment_ref:paymentRef},'Payment order created',201);
}
router.get('/payments/methods',auth,asyncHandler(async(req,res)=>{
 const [[w]]=await db.query('SELECT COALESCE((SELECT balance_after FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 1),0) balance',[req.user.id]);
 return ok(res,{methods:[{code:'CASH',name:'Cash',is_enabled:true},{code:'WALLET',name:'NE CAB Wallet',is_enabled:true,balance:w.balance},{code:'UPI',name:'UPI',is_enabled:!!process.env.RAZORPAY_KEY_ID},{code:'CARD',name:'Card',is_enabled:!!process.env.RAZORPAY_KEY_ID}]});
}));
router.post('/rides/:ride_id/pay',auth,asyncHandler(async(req,res)=>{
 const [r]=await db.query('SELECT * FROM rides WHERE ride_id=? AND user_id=?',[req.params.ride_id,req.user.id]);
 if(!r.length)return fail(res,404,'Ride not found','RIDE_NOT_FOUND');
 if(!['UPI','CARD'].includes(req.body.payment_method))return fail(res,422,'Online payment_method must be UPI or CARD','VALIDATION_ERROR');
 const amount=Number(r[0].final_fare??(r[0].estimated_fare-r[0].discount));
 return createOrder({userId:req.user.id,rideId:r[0].ride_id,purpose:'RIDE',method:req.body.payment_method,amount,res});
}));
router.post('/payments/verify',auth,asyncHandler(async(req,res)=>{
 const {gateway_order_id,gateway_payment_id,razorpay_signature}=req.body;
 if(!gateway_order_id||!gateway_payment_id||!razorpay_signature)return fail(res,422,'gateway_order_id, gateway_payment_id and razorpay_signature are required','VALIDATION_ERROR');
 const expected=crypto.createHmac('sha256',process.env.RAZORPAY_KEY_SECRET||'').update(`${gateway_order_id}|${gateway_payment_id}`).digest('hex');
 if(!process.env.RAZORPAY_KEY_SECRET||!crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(String(razorpay_signature))))return fail(res,400,'Payment verification failed','PAYMENT_VERIFICATION_FAILED');
 const conn=await db.getConnection();
 try{
  await conn.beginTransaction();
  const [p]=await conn.query('SELECT * FROM payments WHERE gateway_order_id=? AND user_id=? FOR UPDATE',[gateway_order_id,req.user.id]);
  if(!p.length)throw Object.assign(new Error('Payment order not found'),{status:404,code:'PAYMENT_NOT_FOUND'});
  if(p[0].status!=='PAID'){
   await conn.query("UPDATE payments SET gateway_payment_id=?,status='PAID' WHERE id=?",[gateway_payment_id,p[0].id]);
   if(p[0].purpose==='RIDE')await conn.query("UPDATE rides SET payment_status='PAID' WHERE ride_id=? AND user_id=?",[p[0].ride_id,req.user.id]);
   else{
    const [last]=await conn.query('SELECT balance_after FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 1',[req.user.id]);
    const balance=Number(last[0]?.balance_after||0)+Number(p[0].amount);
    await conn.query('INSERT INTO wallet_transactions (txn_id,user_id,type,amount,description,balance_after,gateway_order_id,gateway_payment_id) VALUES (?,?,?,?,?,?,?,?)',[id('txn'),req.user.id,'CREDIT',p[0].amount,'Wallet top-up',balance,gateway_order_id,gateway_payment_id]);
   }
  }
  await conn.commit();
  return ok(res,{payment_status:'PAID',receipt_url:null},'Payment verified');
 }catch(e){await conn.rollback();throw e;}finally{conn.release();}
}));
router.get('/wallet',auth,asyncHandler(async(req,res)=>{
 const [[w]]=await db.query('SELECT COALESCE((SELECT balance_after FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT 1),0) balance',[req.user.id]);
 return ok(res,{balance:w.balance,currency:'INR'});
}));
router.post('/wallet/topup',auth,asyncHandler(async(req,res)=>{
 const amount=Number(req.body.amount);if(!Number.isFinite(amount)||amount<10||amount>50000)return fail(res,422,'Top-up amount must be between ₹10 and ₹50,000','INVALID_AMOUNT');
 return createOrder({userId:req.user.id,rideId:null,purpose:'WALLET_TOPUP',method:'WALLET_TOPUP',amount,res});
}));
router.get('/wallet/transactions',auth,asyncHandler(async(req,res)=>{
 const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20));
 const [rows]=await db.query('SELECT txn_id,type,amount,description,ride_id,balance_after,created_at FROM wallet_transactions WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?',[req.user.id,limit,(page-1)*limit]);
 return ok(res,{transactions:rows,page,limit});
}));
module.exports=router;
