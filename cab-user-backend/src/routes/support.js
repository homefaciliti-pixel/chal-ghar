const router=require('express').Router(),auth=require('../middleware/auth'),db=require('../config/db');
const {ok,fail,id,asyncHandler}=require('../utils/http');
router.use(auth);
router.get('/faqs',asyncHandler(async(req,res)=>{const [faqs]=await db.query('SELECT faq_id,question,answer,category FROM support_faqs WHERE is_active=TRUE ORDER BY id');return ok(res,{faqs});}));
router.post('/tickets',asyncHandler(async(req,res)=>{
 const {category,ride_id,subject,message}=req.body;
 if(!['RIDE','PAYMENT','DRIVER','APP','OTHER'].includes(category)||!subject||!message)return fail(res,422,'category, subject and message are required','VALIDATION_ERROR');
 const ticketId=id('ticket');await db.query('INSERT INTO support_tickets (ticket_id,user_id,category,ride_id,subject,message) VALUES (?,?,?,?,?,?)',[ticketId,req.user.id,category,ride_id||null,subject,message]);
 await db.query('INSERT INTO support_messages (ticket_id,sender_type,message) VALUES (?,?,?)',[ticketId,'USER',message]);
 return ok(res,{ticket_id:ticketId,status:'OPEN'},'Support ticket created',201);
}));
router.get('/tickets',asyncHandler(async(req,res)=>{const [tickets]=await db.query('SELECT ticket_id,category,ride_id,subject,message,status,created_at,updated_at FROM support_tickets WHERE user_id=? ORDER BY id DESC',[req.user.id]);return ok(res,{tickets});}));
router.get('/tickets/:ticket_id',asyncHandler(async(req,res)=>{
 const [t]=await db.query('SELECT ticket_id,category,ride_id,subject,message,status,created_at,updated_at FROM support_tickets WHERE ticket_id=? AND user_id=?',[req.params.ticket_id,req.user.id]);if(!t.length)return fail(res,404,'Ticket not found','TICKET_NOT_FOUND');
 const [messages]=await db.query('SELECT sender_type,message,created_at FROM support_messages WHERE ticket_id=? ORDER BY id',[req.params.ticket_id]);return ok(res,{...t[0],messages});
}));
router.post('/tickets/:ticket_id/reply',asyncHandler(async(req,res)=>{
 if(!req.body.message)return fail(res,422,'message is required','VALIDATION_ERROR');
 const [t]=await db.query('SELECT ticket_id,status FROM support_tickets WHERE ticket_id=? AND user_id=?',[req.params.ticket_id,req.user.id]);if(!t.length)return fail(res,404,'Ticket not found','TICKET_NOT_FOUND');
 if(t[0].status==='RESOLVED')return fail(res,409,'Ticket is resolved','TICKET_RESOLVED');
 await db.query('INSERT INTO support_messages (ticket_id,sender_type,message) VALUES (?,?,?)',[req.params.ticket_id,'USER',req.body.message]);
 return ok(res,{},'Reply sent',201);
}));
router.get('/emergency-contacts',asyncHandler(async(req,res)=>{const [contacts]=await db.query('SELECT contact_id,name,mobile_number FROM emergency_contacts WHERE user_id=? ORDER BY id',[req.user.id]);return ok(res,{contacts});}));
router.post('/emergency-contacts',asyncHandler(async(req,res)=>{
 const {name,mobile_number}=req.body;if(!name||!mobile_number)return fail(res,422,'name and mobile_number are required','VALIDATION_ERROR');
 const [[c]]=await db.query('SELECT COUNT(*) AS count FROM emergency_contacts WHERE user_id=?',[req.user.id]);if(c.count>=5)return fail(res,400,'Maximum 5 emergency contacts allowed','CONTACT_LIMIT_REACHED');
 const contactId=id('contact');await db.query('INSERT INTO emergency_contacts (contact_id,user_id,name,mobile_number) VALUES (?,?,?,?)',[contactId,req.user.id,name,mobile_number]);
 return ok(res,{contact_id:contactId,name,mobile_number},'Emergency contact added',201);
}));
router.delete('/emergency-contacts/:contact_id',asyncHandler(async(req,res)=>{const [r]=await db.query('DELETE FROM emergency_contacts WHERE contact_id=? AND user_id=?',[req.params.contact_id,req.user.id]);if(!r.affectedRows)return fail(res,404,'Contact not found','CONTACT_NOT_FOUND');return ok(res,{},'Emergency contact deleted');}));
module.exports=router;
