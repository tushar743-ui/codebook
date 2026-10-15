require('dotenv').config();
const crypto = require('crypto');
const http = require('http');
const express = require('express');
const {Server} = require('socket.io')
const {MongoClient} = require('mongodb');

const {
    MONGODB_URI,
    META_APP_SECRET,
    META_VERIFY_TOKEN,
    META_PAGE_ACCESS_TOKEN,
    PORT=3000,
} = process.env;

if(!MONGODB_URI || !META_APP_SECRET || !META_VERIFY_TOKEN ){
    console.error('Missing MONGODB_URI, META_APP_SECRET or META_VERIFY_TOKEN in .env');
    process.exit(1);
}


const app = express();
const server = http.createServer(app);
const io = new Server(server, {cors:{origin:'*' }});
const client =new MongoClient(MONGODB_URI);
const db = client.db('meta_rpoc');
const leads = db.collection('leads');
const outbox = db.collection('outbox');

app.use(express.json({verify:(req,res,buf)=>{req.rawBody = buf;}   }));

function isSignatureValid(req){
    const received = Buffer.from(req.get('x-hub-signature-256')|| '');
    const expected = Buffer.from(
        'sha256='+ crypto.createHmac('sha256', META_APP_SECRET).update(req.rawBody || ''  ).digest('hex')
    );
return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}


function extractLeadEvents(body){
    if(!body || body.object!=='page' || !Array.isArray(body.entry) ) return null;
    const events = [];
    for (const entry of body.entry){
        for(const change of entry.changes || []){
            if(change.field==='leadgen' && change.value && change.value.leadgen_id){
                events.push(change.value);
            }
        }
    }
    return events;
}

async function fetchLeadFields(leadgenId){
    if(!META_PAGE_ACCESS_TOKEN) return [];
    const url = `https://graph.facebook.com/v24.0/${leadgenId}?access_token=${META_PAGE_ACCESS_TOKEN}`;
    const response = await fetch(url);
    const data = await response.json();
    if(!response.ok) throw new Error(data.error ? data.error.message :'Graph API request failed');
    return (data.field_data || []).map((field)=>({
        name: field.name,
        value: (field.values || []).join(', '),
    
}));
}


function toPayload(lead){
    return {
        id:lead._id,
        formId: lead.formId,
        pageId: lead.pageId,
        fields:lead.fields,
        createdAt: lead.createdAt,
    };
}



async function saveLead(value){
    const id = String(value.leadgen_id);
    if(await leads.findOne({_id:id}))return;

    const lead={
        _id:id,
        formId: value.form_id ? String(value.form_id) :null,
        pageId: value.page_id ? String(value.page_id) :null,
        fields: await fetchLeadFields(id).catch((err)=>{
            console.error(`Could not fetch fields for lead ${id}:`,err.message );
            return [];
        }),
        createdAt:value.created_time ? new Date(value.created_time*1000):new Date(),
        receivedAt: new Date(),
    };
    const event= {
        _id:id,
        type: 'lead.created',
        payload:toPayload(lead),
        status: 'pending',
        attempts: 0,
        createdAt: new Date(),
    };
    
    
const session = client.startSession();
try{
    await session.withTransaction(async()=>{
        await leads.insertOne(lead,{session});
        await outbox.insertOne(event, {session});

    } );
}catch (err){
    if(err.code!==11000)throw err;
}finally {
await session.endSession();
}

}


let publishing = false;
 async function publishOutbox(){
    if(publishing) return;
    publishing = true;
    try{
        const pending = await outbox.find({status:'pending'}).sort({createdAt: 1}).limit(50).toArray();

        for( const event of pending){
            io.emit(event.type, event.payload);
            await outbox.updateOne(
                {_id:event._id},
                {$set:{status:'sent',sentAt:new Date()}, $inc:{attempts:1}}
            );
        }
    }catch(err){
        console.error('Outbox publish failed, will retry:',err.message);
    }finally{
        publishing = false;
    }
 } 


 app.get('/webhook', (req,res)=>{
    if(req.query['hub.mode']=== 'subscribe' && req.query['hub.verify_token']===META_VERIFY_TOKEN ){
        return res.status(200).send(req.query['hub.challenge']);
    }
    res.sendStatus(403);
 })



 app.post('/webhook', async(req,res)=>{
    if(!isSignatureValid(req)){
        console.error('Webhook rejected: invalid signature, check META_APP_SECRET');
        return res.sendStatus(401);
    }
    
    


 const events = extractLeadEvents(req.body);
 if(!events) return res.sendStatus(400);
 console.log(`Webhook received with ${events.length} lead event(s)`);

 try{
    for(const value of events) await saveLead(value);
    res.sendStatus(200);
    publishOutbox();
 }catch (err){
    console.error('Webhook processing failed: ', err.message);
    res.sendStatus(500);
 }


});



app.get('/leads', async(req,res)=>{
    const latest = await leads.find().sort({createdAt:-1}).limit(50).toArray();
res.json(latest.map(toPayload));
});


async function start(){
    await client.connect();
    await outbox.createIndex({status:1, createdAt:1});
    setInterval(publishOutbox, 1000);
    server.listen(PORT,()=> console.log(`Server listening on port ${PORT}`));
}


start().catch((err)=>{
    console.error('Startup failed:', err.message);
    process.exit(1);
});