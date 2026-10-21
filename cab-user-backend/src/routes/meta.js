const router=require('express').Router();
const auth=require('../middleware/auth');
const db=require('../config/db');
const {ok}=require('../utils/http');
router.get('/languages',(req,res)=>ok(res,{languages:[{code:'en',name:'English'},{code:'hi',name:'हिन्दी'}]}));
router.get('/cancel-reasons',auth,(req,res)=>ok(res,{reasons:[
{reason_id:'cr_01',text:'Driver is taking too long'},{reason_id:'cr_02',text:'Changed my plan'},{reason_id:'cr_03',text:'Booked by mistake'},{reason_id:'cr_04',text:'Other'}]}));
module.exports=router;
