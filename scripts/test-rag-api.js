const { Pinecone } = require('@pinecone-database/pinecone');

async function askQuestion(pc, index, question) {
    console.log(`\n\n=== Câu hỏi: "${question}" ===`);
    
    // 1. Lấy embedding
    const embedRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'models/gemini-embedding-001',
            content: { parts: [{ text: question }] },
            outputDimensionality: 768
        })
    });
    const embedData = await embedRes.json();
    const vector = embedData.embedding.values;
    
    // 2. Query Pinecone với đúng namespace
    const queryResponse = await index.namespace('chatbot-tthc-xnc').query({
        vector: vector,
        topK: 3,
        includeMetadata: true
    });
    
    console.log(`- Pinecone tìm được ${queryResponse.matches?.length || 0} tài liệu liên quan.`);
    let context = "";
    if (queryResponse.matches) {
        queryResponse.matches.forEach((match, i) => {
            console.log(`  [Tài liệu ${i+1}] Điểm khớp: ${match.score.toFixed(3)} - Trích nguồn: ${match.metadata.title}`);
            context += `[Tài liệu ${i+1}] ${match.metadata.text}\n`;
        });
    }

    // 3. Gọi Gemini Flash với ngữ cảnh (RAG)
    const prompt = `Bạn là Trợ lý tư vấn pháp luật xuất nhập cảnh.
Hãy trả lời câu hỏi sau dựa trên các tài liệu pháp luật được cung cấp.
1. Nếu tài liệu có thông tin, hãy tóm tắt ngắn gọn và trích dẫn Điều/Khoản luật.
2. Nếu tài liệu không chứa thông tin, hãy nói "Tôi chưa tìm thấy thông tin chính xác".

Tài liệu:
${context}

Câu hỏi: ${question}`;

    const chatRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1 }
        })
    });
    const chatData = await chatRes.json();
    console.log(`\n=> Trả lời (AI RAG):\n${chatData.candidates[0].content.parts[0].text.trim()}`);
}

async function run() {
    try {
        const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
        const index = pc.index('chatbot-tthc-xnc');
        
        // Test case 1: Câu hỏi về mức phạt
        await askQuestion(pc, index, "Quá hạn visa 5 ngày bị phạt bao nhiêu tiền?");
        
        // Test case 2: Câu hỏi về thủ tục (người nước ngoài)
        await askQuestion(pc, index, "Thủ tục xin cấp thẻ tạm trú cho người lao động nước ngoài?");
        
        // Test case 3: Câu hỏi cấp hộ chiếu (công dân VN)
        await askQuestion(pc, index, "Tôi làm lại hộ chiếu bị mất thì mất bao lâu mới có?");
        
    } catch (e) {
        console.error("Lỗi:", e.message);
    }
}

run();
