function bounded(buffer,limit){if(buffer.length>limit)throw new Error('Payload too large');return buffer;}
async function bufferBody(req,limit=4_000_000){
  if(Buffer.isBuffer(req.body))return bounded(req.body,limit);
  if(typeof req.body==='string')return bounded(Buffer.from(req.body),limit);
  const chunks=[];let size=0;
  for await(const chunk of req){const b=Buffer.from(chunk);size+=b.length;if(size>limit)throw new Error('Payload too large');chunks.push(b);}
  return Buffer.concat(chunks);
}
async function jsonBody(req,limit=1_000_000){
  let body;
  if(req.body!==undefined&&typeof req.body==='object'&&!Buffer.isBuffer(req.body)){
    bounded(Buffer.from(JSON.stringify(req.body)),limit);body=req.body;
  }else{
    const text=(await bufferBody(req,limit)).toString('utf8');
    try{body=text?JSON.parse(text):{};}catch{throw new Error('Invalid JSON');}
  }
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('JSON object required');
  return body;
}
module.exports={jsonBody,bufferBody};
