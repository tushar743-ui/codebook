const {spawn} = require('child_process');
const path = require('path');



require('./server/node_modules/dotenv').config({path: path.join(__dirname,'server','.env'),quiet:true});

const {META_APP_ID, META_APP_SECRET,META_VERIFY_TOKEN}= process.env;
const PORT = process.env.PORT || 3000;
const children =[];


function run(command, args,options){
    const child = spawn(command, args, options);
    child.detached= Boolean(options.detached);
    children.push(child);
    return child;
}


function stop(){
    for (const child of children){
        try{
            process.kill(child.detached ? -child.pid: child.pid);
        }catch(err){}
    }
    process.exit();
}

async function registerWebhook(publicUrl) {
    if(!META_APP_ID){
        console.log('META_APP_ID is not set, update the webhook callback in the Meta app manually');
    return;
}

const body = new URLSearchParams({
    object:'page',
    callback_url:`${publicUrl}/webhook`,
    fields:'leadgen',
    verify_token: META_VERIFY_TOKEN,
    access_token: `${META_APP_ID}|${META_APP_SECRET}`,  
});
let lastError='';
for(let attempt = 0;attempt<10;attempt++){
    try{
        const response = await fetch(`https://graph.facebook.com/v24.0/${META_APP_ID}/subscriptions`,{
            method:'POST',
            body,
        });
        const data = await response.json();
        if(data.success){
            console.log('Meta webhook callback updated automatically');
            return;
        }
        lastError = data.error?data.error.message:'unknown error';
    }catch(err){
        lastError= err.message;
    }
    await new Promise((resolve)=>setTimeout(resolve,3000));
}
console.error('Could not update the Meta webhook callback:', lastError);
}



function startExpo(publicUrl,attempt){
    const expo =run('node_modules/.bin/expo',['start','--tunnel',...process.argv.slice(2)],{
        cwd:path.join(__dirname,'app'),
        stdio:'inherit',
        env:{...process.env, EXPO_PUBLIC_SERVER_URL:publicUrl},
    });
    expo.on('exit',(code)=>{
        if(code && attempt<3){
            console.log(`Expo failed to start, retrying(${attempt+1}/3)`);
            setTimeout(()=>startExpo(publicUrl,attempt+1),5000);
            return;
        }
        stop();
    });
}


process.on('SIGINT',stop);
process.on('SIGTERM',stop);


const server = run('node',['index.js'],{cwd:path.join(__dirname, 'server'),stdio:'inherit'});
server.on('exit',stop);


const tunnel = run('npx', ['-y', 'cloudflared', 'tunnel', '--url',`http://localhost:${PORT}`],{
    stdio:['ignore', 'ignore','pipe'],
    detached:true,
});
tunnel.on('exit',stop);


let expoStarted = false;

tunnel.stderr.on('data',(chunk)=>{
    const match = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if(!match || expoStarted)return;
    expoStarted=true;

    console.log(`\nPublic URL:  ${match[0]}`);
    console.log(`Webhook callback: ${match[0]}/webhook\n`);
    registerWebhook(match[0]);

    startExpo(match[0],1);
});