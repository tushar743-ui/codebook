import {useEffect, useState} from 'react';
import {FlatList, StyleSheet, Text, View} from 'react-native';
import {StatusBar} from 'expo-status-bar';
import {io} from 'socket.io-client';


const SERVER_URL = process.env.EXPO_PUBLIC_SERVER_URL || 'http://localhost:3000';

function mergeLeads(current, incoming){
    const byId = new Map(current.map((lead )=>[lead.id, lead]));
    for (const lead of incoming) byId.set(lead.id, lead);
    return [...byId.values()].sort((a,b)=>new Date(b.createdAt) - new Date(a.createdAt));
}


export default function App(){
    const [leads, setLeads] = useState([]);
    const [connected, setConnected]= useState(false);

    useEffect(()=>{
        const socket  = io(SERVER_URL, {transports:['websocket'] });
        socket.on('connect',()=>{
            setConnected(true);
            fetch(`${SERVER_URL}/leads`)
            .then((response)=>response.json())
            .then((saved)=>setLeads((current)=> mergeLeads(current,saved)) )
            .catch((err)=> console.warn('Could not load leads:',err.message));
            
        } );
        socket.on('disconnect',()=>setConnected(false));
        socket.on('lead.created',(lead)=>setLeads((current)=>mergeLeads(current,[lead])));

        return()=> socket.close();
    }, []);

   return(
    <View style={styles.container}>
        <StatusBar style='auto'/> 
        <Text style={styles.title}>Meta Leads</Text>
        <Text style={connected ? styles.online: styles.offline }>
        {connected  ?  'Live': 'Connecting...' } · {leads.length} leads
        </Text>
        <FlatList
            data={leads}
            keyExtractor={(leads)=>leads.id}
            ListEmptyComponent={<Text style={styles.empty}>Waiting for first lead</Text>}
                renderItem={({item})=>(
                <View style={styles.card}>
                    <Text style ={styles.leadId} >Lead{item.id}</Text>
                    {item.fields.map((field)=>(
                        <Text key={field.name} style={styles.field} >
                            {field.name}:{field.value}
                        </Text>
                    ))}
                     <Text style={styles.time}> {new Date(item.createdAt).toLocaleString()}  </Text>
                </View>
            )}
        />
    </View>
   )
}

const styles = StyleSheet.create({
    container: {flex:1, backgroundColor: '#f4f5f7', paddingTop:60, paddingHorizontal:16 },
    title:{fontSize:28, fontWeight:'700' },
    online:{color:'#1a7f37', marginVertical:8 },
    offline:{color:'#b35900',marginVertical:8},
    empty:{textAlign:'center', marginTop:40,color:'#666'},
    card:{backgroundColor:'#fff', borderRadius:10,padding:14,marginBottom:10},
    leadId:{fontWeight:'600',marginBottom:6},
    field:{color:'#333', marginBottom:2},
    time:{color:'#888', fontSize:12, marginTop:6},
});






