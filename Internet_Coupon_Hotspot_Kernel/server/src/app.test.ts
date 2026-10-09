import {describe,it,expect} from "vitest";
import request from "supertest";
import {app} from "./app.js";
describe("kernel API",()=>{it("reports honest capability flags",async()=>{const r=await request(app).get("/api/v1/health");expect(r.status).toBe(200);expect(r.body.capabilities.hotspotEnforcement).toBe(false);expect(r.body.capabilities.paymentVerification).toBe(false)});it("returns structured 404",async()=>{const r=await request(app).get("/missing");expect(r.status).toBe(404);expect(r.body.error.code).toBe("NOT_FOUND")})});
