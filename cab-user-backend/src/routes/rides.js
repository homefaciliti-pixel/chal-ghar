const router=require('express').Router();
const auth=require('../middleware/auth'),db=require('../config/db');
const {ok,fail,id,asyncHandler}=require('../utils/http');
const {estimate}=require('../services/fare.service');
const activeStatuses=['SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVED','TRIP_STARTED','SCHEDULED'];
async function ownedRide(rideId,userId){const [r]=await db.query('SELECT * FROM rides WHERE ride_id=? AND user_id=? LIMIT 1',[rideId,userId]);return r[0];}
async function ridePayload(r){
 const [driverRows]=r.driver_id?[await db.query('SELECT * FROM drivers WHERE driver_id=? LIMIT 1',[r.driver_id])]:[[]];
 const d=driverRows[0];
 const [v]=await db.query('SELECT name FROM vehicle_types WHERE vehicle_type_id=?',[r.vehicle_type_id]);
 const [timeline]=await db.query('SELECT status,created_at AS at FROM ride_timeline WHERE ride_id=? ORDER BY id',[r.ride_id]);
 return {ride_id:r.ride_id,status:r.status,pickup:{latitude:r.pickup_lat,longitude:r.pickup_lng,address:r.pickup_address},drop:{latitude:r.drop_lat,longitude:r.drop_lng,address:r.drop_address},driver:d?{driver_id:d.driver_id,name:d.name,photo_url:d.photo_url,rating:d.rating,total_trips:d.total_trips,phone_masked:d.phone_masked,latitude:d.latitude,longitude:d.longitude}:null,vehicle:d?{type:v[0]?.name||d.vehicle_type,make_model:d.make_model,color:d.vehicle_color,registration_number:d.registration_number}:null,ride_otp:['DRIVER_ASSIGNED','DRIVER_ARRIVED'].includes(r.status)?r.ride_otp:null,eta_minutes:null,fare:{estimated:r.estimated_fare,final:r.final_fare,discount:r.discount,payable:r.final_fare==null?null:Math.max(0,r.final_fare-r.discount)},payment:{method:r.payment_method,status:r.payment_status},timeline,created_at:r.created_at};
}
router.post('/estimates',auth,asyncHandler(async(req,res)=>{
 const {pickup,drop,vehicle_type_id}=req.body;
 if(!pickup||!drop||!vehicle_type_id||![pickup.latitude,pickup.longitude,drop.latitude,drop.longitude].every(x=>Number.isFinite(Number(x))))return fail(res,422,'pickup, drop coordinates and vehicle_type_id are required','VALIDATION_ERROR');
 return ok(res,await estimate({pickup,drop,vehicleTypeId:vehicle_type_id}),'Estimate created');
}));
router.post('/',auth,asyncHandler(async(req,res)=>{
 const {estimate_id,vehicle_type_id,payment_method='CASH',promo_code=null,note_for_driver=null,pickup,drop}=req.body;
 if(!vehicle_type_id||!pickup||!drop||!pickup.address||!drop.address)return fail(res,422,'vehicle_type_id, pickup and drop (with address and coordinates) are required','VALIDATION_ERROR');
 if(!['CASH','WALLET','UPI','CARD'].includes(payment_method))return fail(res,422,'Invalid payment_method','VALIDATION_ERROR');
 if(![pickup.latitude,pickup.longitude,drop.latitude,drop.longitude].every(x=>Number.isFinite(Number(x))))return fail(res,422,'Valid pickup/drop coordinates are required','VALIDATION_ERROR');
 const [active]=await db.query(`SELECT ride_id FROM rides WHERE user_id=? AND status IN (${activeStatuses.map(()=>'?').join(',')}) LIMIT 1`,[req.user.id,...activeStatuses]);
 if(active.length)return fail(res,409,'An active ride already exists','ACTIVE_RIDE_EXISTS');
 const fare=await estimate({pickup,drop,vehicleTypeId:vehicle_type_id});
 let discount=0;
 if(promo_code){
   const [p]=await db.query('SELECT * FROM promos WHERE code=? AND is_active=TRUE AND (valid_till IS NULL OR valid_till>=UTC_TIMESTAMP()) AND (usage_limit IS NULL OR used_count<usage_limit) LIMIT 1',[promo_code]);
   if(!p.length)return fail(res,400,'Invalid or expired promo code','INVALID_PROMO');
   if(fare.estimated_fare<p[0].min_fare)return fail(res,400,'Minimum fare condition not met','PROMO_MIN_FARE_NOT_MET');
   discount=p[0].discount_type==='FLAT'?Number(p[0].discount_value):fare.estimated_fare*Number(p[0].discount_value)/100;
   if(p[0].max_discount!=null)discount=Math.min(discount,Number(p[0].max_discount));
   discount=Math.min(discount,fare.estimated_fare);
 }
 const rideId=id('ride'),rideOtp=String(require('crypto').randomInt(1000,10000));
 const [result]=await db.query('INSERT INTO rides (ride_id,user_id,vehicle_type_id,estimate_id,status,pickup_lat,pickup_lng,pickup_address,drop_lat,drop_lng,drop_address,payment_method,estimated_fare,discount,promo_code,note_for_driver,ride_otp) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
 [rideId,req.user.id,vehicle_type_id,estimate_id||fare.estimate_id,'SEARCHING',pickup.latitude,pickup.longitude,pickup.address,drop.latitude,drop.longitude,drop.address,payment_method,fare.estimated_fare,discount,promo_code,note_for_driver,rideOtp]);
 await db.query('INSERT INTO ride_timeline (ride_id,status,note) VALUES (?,?,?)',[rideId,'SEARCHING','Ride request created']);
 // Dispatch is intentionally not faked: connect your driver/dispatch service to assign a real driver.
 return ok(res,{ride_id:rideId,status:'SEARCHING',search_timeout_seconds:90,estimated_fare:fare.estimated_fare,discount},'Searching for a driver',201);
}));
router.get('/latest',auth,asyncHandler(async(req,res)=>{
 const [r]=await db.query("SELECT * FROM rides WHERE user_id=? AND status IN ('COMPLETED','CANCELLED_BY_USER','CANCELLED_BY_DRIVER') ORDER BY created_at DESC LIMIT 1",[req.user.id]);
 return ok(res,{ride:r[0]?await ridePayload(r[0]):null});
}));
router.get('/active',auth,asyncHandler(async(req,res)=>{
 const [r]=await db.query(`SELECT * FROM rides WHERE user_id=? AND status IN (${activeStatuses.map(()=>'?').join(',')}) ORDER BY created_at DESC LIMIT 1`,[req.user.id,...activeStatuses]);
 return ok(res,{ride:r[0]?await ridePayload(r[0]):null});
}));
router.get('/',auth,asyncHandler(async(req,res)=>{
 const page=Math.max(1,Number(req.query.page)||1),limit=Math.min(100,Math.max(1,Number(req.query.limit)||20)),offset=(page-1)*limit;
 const allowed=['COMPLETED','CANCELLED_BY_USER','CANCELLED_BY_DRIVER','SCHEDULED'];
 const where=['user_id=?'],params=[req.user.id];
 if(req.query.status){if(!allowed.includes(req.query.status))return fail(res,422,'Invalid status filter','VALIDATION_ERROR');where.push('status=?');params.push(req.query.status);}
 const [rows]=await db.query(`SELECT * FROM rides WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT ? OFFSET ?`,[...params,limit,offset]);
 const [[count]]=await db.query(`SELECT COUNT(*) AS total FROM rides WHERE ${where.join(' AND ')}`,params);
 return ok(res,{rides:rows.map(r=>({ride_id:r.ride_id,service_type:'RIDE',pickup:{address:r.pickup_address},drop:{address:r.drop_address},vehicle_type:r.vehicle_type_id,fare:r.final_fare??r.estimated_fare,status:r.status,created_at:r.created_at})),pagination:{page,limit,total:count.total}});
}));
router.get('/:ride_id',auth,asyncHandler(async(req,res)=>{
 const r=await ownedRide(req.params.ride_id,req.user.id);if(!r)return fail(res,404,'Ride not found','RIDE_NOT_FOUND');
 return ok(res,await ridePayload(r));
}));
router.post('/:ride_id/cancel',auth,asyncHandler(async(req,res)=>{
 const r=await ownedRide(req.params.ride_id,req.user.id);if(!r)return fail(res,404,'Ride not found','RIDE_NOT_FOUND');
 if(!['SEARCHING','DRIVER_ASSIGNED','DRIVER_ARRIVED','SCHEDULED'].includes(r.status))return fail(res,400,'Ride can no longer be cancelled','CANCEL_NOT_ALLOWED');
 const reason=req.body.reason_id||null;
 const fee=0;
 await db.query("UPDATE rides SET status='CANCELLED_BY_USER',cancellation_fee=? WHERE ride_id=?",[fee,r.ride_id]);
 await db.query('INSERT INTO ride_timeline (ride_id,status,note) VALUES (?,?,?)',[r.ride_id,'CANCELLED_BY_USER',req.body.note||reason||'Cancelled by user']);
 return ok(res,{status:'CANCELLED_BY_USER',cancellation_fee:fee},'Ride cancelled');
}));
router.get('/:ride_id/track',auth,asyncHandler(async(req,res)=>{
 const r=await ownedRide(req.params.ride_id,req.user.id);if(!r)return fail(res,404,'Ride not found','RIDE_NOT_FOUND');
 const [d]=r.driver_id?await db.query('SELECT latitude,longitude,heading FROM drivers WHERE driver_id=?',[r.driver_id]):[[]];
 return ok(res,{status:r.status,driver_location:d[0]?{latitude:d[0].latitude,longitude:d[0].longitude,heading:d[0].heading}:null,eta_minutes:null,route_polyline:null,message:'Connect a routing/maps provider for ETA and route polyline'});
}));
router.post('/:ride_id/share',auth,asyncHandler(async(req,res)=>{
 const r=await ownedRide(req.params.ride_id,req.user.id);if(!r)return fail(res,404,'Ride not found','RIDE_NOT_FOUND');
 const share=id('share'),expires=new Date(Date.now()+8*3600*1000);
 await db.query('INSERT INTO shared_trips (share_id,ride_id,user_id,expires_at) VALUES (?,?,?,?)',[share,r.ride_id,req.user.id,expires]);
 return ok(res,{share_url:`${process.env.APP_BASE_URL||'http://localhost:5000'}/track/${share}`,expires_at:expires.toISOString()},'Trip link created');
}));
router.post('/:ride_id/sos',auth,asyncHandler(async(req,res)=>{
 const r=await ownedRide(req.params.ride_id,req.user.id);if(!r)return fail(res,404,'Ride not found','RIDE_NOT_FOUND');
 const {latitude,longitude}=req.body;if(!Number.isFinite(Number(latitude))||!Number.isFinite(Number(longitude)))return fail(res,422,'latitude and longitude required','VALIDATION_ERROR');
 const sosId=id('sos');await db.query('INSERT INTO sos_events (sos_id,ride_id,user_id,latitude,longitude) VALUES (?,?,?,?,?)',[sosId,r.ride_id,req.user.id,latitude,longitude]);
 console.warn('SOS CREATED: configure real-time admin/support alert and emergency SMS',sosId);
 return ok(res,{sos_id:sosId},'SOS recorded',200);
}));
router.post('/:ride_id/rating',auth,asyncHandler(async(req,res)=>{
 const r=await ownedRide(req.params.ride_id,req.user.id);if(!r)return fail(res,404,'Ride not found','RIDE_NOT_FOUND');
 if(r.status!=='COMPLETED')return fail(res,400,'Ride must be completed before rating','RIDE_NOT_COMPLETED');
 const rating=Number(req.body.rating);if(!Number.isInteger(rating)||rating<1||rating>5)return fail(res,422,'rating must be between 1 and 5','VALIDATION_ERROR');
 const [exists]=await db.query('SELECT id FROM ride_ratings WHERE ride_id=?',[r.ride_id]);if(exists.length)return fail(res,409,'Ride already rated','ALREADY_RATED');
 await db.query('INSERT INTO ride_ratings (ride_id,user_id,rating,tags,comment,tip_amount) VALUES (?,?,?,?,?,?)',[r.ride_id,req.user.id,rating,JSON.stringify(req.body.tags||[]),req.body.comment||null,Math.max(0,Number(req.body.tip_amount)||0)]);
 return ok(res,{},'Rating submitted',201);
}));
module.exports=router;
