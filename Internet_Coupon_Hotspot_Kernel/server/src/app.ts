import express from "express";
import cors from "cors";
import helmet from "helmet";
import { z } from "zod";

const env = z.object({NODE_ENV:z.enum(["development","test","production"]).default("development"),CORS_ORIGIN:z.string().default("http://localhost:5173")}).parse({NODE_ENV:process.env.NODE_ENV,CORS_ORIGIN:process.env.CORS_ORIGIN});
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({origin:env.CORS_ORIGIN.split(",").map(x=>x.trim())}));
app.use(express.json({limit:"256kb"}));
app.get("/api/v1/health",(_req,res)=>res.json({status:"ok",service:"internet-coupon-hotspot-api",version:"v1",mode:"kernel-only",capabilities:{persistentStorage:false,paymentVerification:false,hotspotEnforcement:false,perClientTrafficAccounting:false}}));
app.get("/api/v1",(_req,res)=>res.json({name:"Internet Coupon Hotspot API",version:"v1",status:"kernel",message:"Business modules are not implemented yet."}));
app.use((_req,res)=>res.status(404).json({error:{code:"NOT_FOUND",message:"The requested API route was not found."}}));
app.use((err:unknown,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(env.NODE_ENV!=="production") console.error(err);res.status(500).json({error:{code:"INTERNAL_ERROR",message:"Something went wrong. Please try again."}})});
