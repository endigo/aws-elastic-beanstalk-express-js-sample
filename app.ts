import express from "express";

const app = express();
const PORT = 8000;

app.get("/", (req, res) => {
    res.send("Hello from Express on Bun!");
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Express server listening on http://localhost:${PORT}`);
    });
}

export default app;
