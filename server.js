const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
app.use(cors()); // Allow CORS from your specific domain
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public'))); // Serve static files from public directory

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

let clients = [];

// ส่งข้อความใหม่ให้ทุก client
function sendToClients(message) {
    clients.forEach((client) => client.res.write(`data: ${JSON.stringify(message)}\n\n`));
}

app.get('/api/home', (req, res) => {
    res.status(201).json({ message: 'hello' });
})

// Endpoint สำหรับ SSE
app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders(); // Ensure headers are sent before writing to the stream

    clients.push({ id: Date.now(), res });

    // Tell the client to retry after 3000ms (3 seconds) if the connection is lost
    res.write(`retry: 3000\n\n`);

    // Fetch existing messages from Supabase
    supabase
        .from('contents')
        .select('*')
        .then(({ data, error }) => {
            if (error) {
                console.error(error);
            } else {
                res.write(`data: ${JSON.stringify(data)}\n\n`);
            }
        });

    req.on('close', () => {
        clients = clients.filter((client) => client.res !== res);
    });
});

// Endpoint สำหรับเพิ่มข้อความ
app.post('/api/add-message', (req, res) => {
    const { message, name } = req.body;

    if (!message || !name) {
        return res.status(400).json({ error: 'กรุณาใส่ชื่อและข้อความ' });
    }

    const newMessage = { id: Date.now(), message, name };

    // Insert message into Supabase
    supabase
        .from('contents')
        .insert([newMessage])
        .then(({ data, error }) => {
            if (error) {
                console.error(error);
            } else {
                sendToClients(newMessage); // ส่งข้อความใหม่ให้ทุก client
                res.status(201).json({ success: true });
            }
        });
});

// Endpoint สำหรับดูข้อความ
app.get('/api/messages', (req, res) => {
    // Fetch messages from Supabase
    supabase
        .from('contents')
        .select('*')
        .then(({ data, error }) => {
            if (error) {
                console.error(error);
            } else {
                console.log(data);
                res.json(data); // ส่งข้อความทั้งหมดกลับในรูปแบบ JSON
            }
        });
});

// Endpoint สำหรับลบข้อความ
app.delete('/api/messages/:id', (req, res) => {
    const messageId = parseInt(req.params.id, 10); // แปลง ID ที่ส่งมาเป็นตัวเลข

    // Delete message from Supabase
    supabase
        .from('contents')
        .delete()
        .eq('id', messageId)
        .then(({ data, error }) => {
            if (error) {
                console.error(error);
            } else {
                res.status(200).send('ข้อความถูกลบแล้ว');
            }
        });
});

// Endpoint สำหรับส่งข้อความเฉพาะ ID ให้ clients
app.post('/api/messages/:id', (req, res) => {
    const messageId = parseInt(req.params.id, 10);

    // Fetch specific message from Supabase
    supabase
        .from('contents')
        .select('*')
        .eq('id', messageId)
        .single()
        .then(({ data, error }) => {
            if (error) {
                console.error(error);
                res.status(404).json({ error: 'ไม่พบข้อความ' });
            } else if (data) {
                sendToClients(data); // ส่งข้อความให้ทุก client
                res.status(200).json({ success: true });
            }
        });
});

// Serve HTML files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/display', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// เริ่มเซิร์ฟเวอร์
const PORT = process.env.PORT || 3000; // ใช้ port จาก environment variable
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
