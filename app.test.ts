import { describe, it, expect } from "bun:test";
import request from "supertest";
import app from "./app";

describe("Express Application", () => {
    describe("GET /", () => {
        it("should return 200 status", async () => {
            const response = await request(app).get("/");
            expect(response.status).toBe(200);
        });

        it("should return correct message", async () => {
            const response = await request(app).get("/");
            expect(response.text).toBe("Hello from Express on Bun!");
        });

        it("should have text/html content type", async () => {
            const response = await request(app).get("/");
            expect(response.headers["content-type"]).toMatch(/text\/html/);
        });
    });

    describe("GET /nonexistent", () => {
        it("should return 404 for non-existent routes", async () => {
            const response = await request(app).get("/nonexistent");
            expect(response.status).toBe(404);
        });
    });
});
