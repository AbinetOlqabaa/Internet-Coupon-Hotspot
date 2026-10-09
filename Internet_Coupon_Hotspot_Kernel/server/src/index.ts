import "dotenv/config";
import { app } from "./app.js";
const port=Number(process.env.PORT??4000);
if(!Number.isInteger(port)||port<1||port>65535) throw new Error("PORT must be a valid TCP port");
app.listen(port,"0.0.0.0",()=>console.log(`Hotspot API listening on ${port}`));
