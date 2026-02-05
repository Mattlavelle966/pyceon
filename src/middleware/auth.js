

// middlewar helper for apiKey auth
// auth of key must happen before we create the stream
export function requireApiKey(apiKey) {
  //quit if null
  if (!apiKey) {throw new error("requireApiKey: apiKey is required");}
  

  //acctual middleware helper
  return funtion authMiddleware(req,res,next){
    const provided = req.header("x-api-key"):
    if(provided !== apiKey){
      return res.status(401).json({error:"Unauthorized"});
    }
    next();
  };



}
