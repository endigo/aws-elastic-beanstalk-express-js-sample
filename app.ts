import express from "express";

const app = express();
const PORT = 8080;

app.get("/", (_, res) => {
    res.send("Hello World!");
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`App running on http://localhost:${PORT}`);
    });
}

export default app;
