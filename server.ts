import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Allow large payloads for base64 handwritten essay images
app.use(express.json({ limit: '35mb' }));
app.use(express.urlencoded({ extended: true, limit: '35mb' }));

// Initialize Gemini API client
const apiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({
  apiKey,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// API health endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    hasApiKey: Boolean(apiKey),
    app: 'TRỢ LÝ AI CHẤM BÀI NGỮ VĂN THPT – GDPT 2018',
    timestamp: new Date().toISOString(),
  });
});

// API to OCR / Transcribe handwritten literature papers
app.post('/api/ocr-handwriting', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'Thiếu dữ liệu ảnh bài làm' });
    }

    if (!apiKey) {
      return res.status(500).json({ error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ' });
    }

    // Clean base64 data if it contains data URI prefix
    const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType,
              data: cleanBase64,
            },
          },
          {
            text: `Bạn là trợ lý OCR chuyên đọc chữ viết tay bài kiểm tra Ngữ văn THPT của học sinh Việt Nam.
Hãy đọc và chuyển toàn bộ chữ viết tay trong ảnh thành văn bản tiếng Việt có dấu đầy đủ, giữ đúng cấu trúc đoạn văn, thụt dòng, tiêu đề câu (ví dụ: Câu 1, Câu 2, Phần I, Phần II).
Quy tắc quan trọng:
1. Đọc chính xác, giữ nguyên các từ học sinh viết, không tự ý sửa lỗi chính tả hay thêm thắt từ ngữ.
2. Nếu có đoạn bị nhòe mực, rách giấy hoặc chữ quá mờ không thể nhận diện chắc chắn, hãy ghi chú rõ trong dấu ngoặc vuông: [chữ mờ không đọc rõ], KHÔNG ĐƯỢC TỰ SUY DIỄN BỊA ĐẶT NỘI DUNG.
3. Trả về đúng nội dung văn bản học sinh đã làm.`,
          },
        ],
      },
    });

    const transcribedText = response.text || '';
    return res.json({ text: transcribedText });
  } catch (err: any) {
    console.error('Error in /api/ocr-handwriting:', err);
    return res.status(500).json({
      error: 'Không thể nhận diện chữ viết tay từ ảnh: ' + (err?.message || 'Lỗi xử lý AI'),
    });
  }
});

// API to Grade Literature Essay according to GDPT 2018
app.post('/api/grade-essay', async (req: Request, res: Response) => {
  try {
    const {
      examTitle,
      gradeLevel,
      school,
      examPrompt,
      examGuide,
      maxScore = 10,
      rubricCriteria = [],
      teacherNotes = '',
      studentName,
      studentClass,
      submissionContent = '',
      attachments = [], // [{ name, mimeType, base64 }]
    } = req.body;

    if (!examPrompt || (!submissionContent && (!attachments || attachments.length === 0))) {
      return res.status(400).json({
        error: 'Thiếu thông tin đề bài hoặc nội dung bài làm của học sinh để chấm.',
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        error: 'Chưa cấu hình GEMINI_API_KEY. Vui lòng kiểm tra biến môi trường của hệ thống.',
      });
    }

    // Build the prompt adhering strictly to Vietnamese GDPT 2018 Literature guidelines
    const criteriaDescription = Array.isArray(rubricCriteria) && rubricCriteria.length > 0
      ? rubricCriteria
          .map(
            (c: any, idx: number) =>
              `${idx + 1}. [${c.section || 'Phần bài'}] ${c.title || c.criterion}: Điểm tối đa ${c.maxScore}đ. Yêu cầu / Tiêu chí: ${c.description || 'Theo đáp án chuẩn'}`
          )
          .join('\n')
      : 'Chấm theo cấu trúc Đề thi Ngữ văn THPT GDPT 2018 (Phần I: Đọc hiểu 3-4 điểm; Phần II: Viết đoạn NLXH 2 điểm; Phần III: Viết bài NLVH 4-5 điểm hoặc theo đề bài giáo viên cung cấp).';

    const systemPrompt = `Bạn là Trợ lý AI Chuyên gia Giám khảo chấm thi môn Ngữ văn cấp Trung học Phổ thông (THPT) theo Chương trình Giáo dục Phổ thông 2018 (GDPT 2018) của Bộ Giáo dục và Đào tạo Việt Nam.

Nhiệm vụ của bạn là đánh giá khách quan, khoa học, nhân văn và chuẩn mực sư phạm bài làm của học sinh theo đúng Đề bài, Đáp án/Hướng dẫn chấm và Tiêu chí do giáo viên thiết lập.

12 NGUYÊN TẮC CHẤM BẮT BUỘC (TUÂN THỦ TUYỆT ĐỐI):
1. Đánh giá bài làm theo đúng đáp án và thang điểm do giáo viên cung cấp.
2. Tuyệt đối KHÔNG tự ý thay đổi thang điểm tối đa (${maxScore} điểm). Tổng điểm thành phần phải khớp chính xác với điểm đề xuất.
3. Chấm từng câu hoặc từng tiêu chí, ghi rõ:
   - Điểm tối đa của câu/tiêu chí.
   - Điểm đề xuất (chấm chính xác đến 0.25 điểm).
   - Nhận xét và căn cứ sư phạm rõ ràng, trích dẫn bằng chứng cụ thể từ bài làm học sinh.
4. Với các câu hỏi mở (thông hiểu, vận dụng, suy ngẫm, thông điệp...), CHẤP NHẬN CÁCH DIỄN ĐẠT KHÁC ĐÁP ÁN MẪU nếu học sinh lí giải hợp lí, chính xác, có căn cứ và phù hợp chuẩn mực đạo đức, pháp luật.
5. Tuyệt đối không bắt buộc học sinh phải viết rập khuôn, giống nguyên văn đáp án mẫu.
6. Đánh giá toàn diện: chất lượng lập luận, tính xác đáng của dẫn chứng, chiều sâu phân tích tác phẩm/vấn đề, khả năng diễn đạt lưu loát và tính sáng tạo (có cách nhìn riêng có căn cứ).
7. Nếu bài làm là ảnh/bản quét và có đoạn không rõ chữ hoặc mờ, KHÔNG TỰ SUY DIỄN NỘI DUNG, hãy ghi chú rõ đoạn không đọc được và đánh giá dựa trên phần đọc được.
8. Phân biệt rành mạch 3 nhóm lỗi:
   - Lỗi kiến thức (hiểu sai văn bản tác phẩm, sai thời đại, sai sự kiện, nhầm nhân vật...).
   - Lỗi lập luận (mâu thuẫn logic, lạc đề, lập luận luẩn quẩn, thiếu dẫn chứng hoặc dẫn chứng không liên quan).
   - Lỗi diễn đạt (dùng từ sai, lỗi ngữ pháp câu què cụt, chính tả, thiếu liên kết câu/đoạn).
9. Nhận xét chi tiết: Nêu rõ Ưu điểm (khen ngợi đúng chỗ), Hạn chế cụ thể, và Hướng dẫn sửa chữa nâng cấp bài viết rõ ràng để học sinh tiến bộ.
10. Tính tổng điểm chính xác, không bao giờ được vượt quá điểm tối đa (${maxScore} điểm).
11. Nếu thiếu đáp án hoặc tiêu chí quan trọng của giáo viên, chỉ chấm dựa trên nội dung đã có kèm nhắc nhở giáo viên xem lại, không tự đặt ra tiêu chuẩn phi lý.
12. Kết luận trạng thái chấm luôn là "AI đã chấm – Chờ giáo viên duyệt". Điểm số này chỉ mang tính tham vấn sư phạm chuyên sâu, quyền quyết định chính thức thuộc về giáo viên.

TRẢ VỀ ĐỊNH DẠNG JSON DUY NHẤT VỚI CẤU TRÚC SAU (KHÔNG KÈM TEXT NGOÀI JSON):
{
  "totalMaxScore": ${maxScore},
  "totalSuggestedScore": number,
  "status": "Chờ giáo viên duyệt",
  "criteriaGrades": [
    {
      "id": "c1",
      "section": "Phần I: Đọc hiểu",
      "criterion": "Tên câu / tiêu chí",
      "maxScore": number,
      "suggestedScore": number,
      "reason": "Nhận xét chi tiết và căn cứ chấm",
      "quoteOrEvidence": "Trích dẫn dòng/câu của học sinh làm bằng chứng"
    }
  ],
  "generalFeedback": {
    "overallComment": "Đánh giá khái quát toàn bài làm",
    "strengths": ["Ưu điểm 1", "Ưu điểm 2"],
    "weaknesses": ["Hạn chế 1", "Hạn chế 2"],
    "errorsToCorrect": [
      {
        "type": "Lỗi kiến thức" | "Lỗi lập luận" | "Lỗi diễn đạt, chính tả",
        "description": "Chi tiết lỗi học sinh mắc phải",
        "suggestion": "Hướng dẫn sửa chuẩn xác"
      }
    ],
    "actionableAdvice": "Lời khuyên sư phạm cụ thể giúp học sinh rèn luyện kỹ năng viết"
  },
  "rubricCoverageCheck": "Nhận định về mức độ đáp ứng hướng dẫn chấm của đề bài"
}`;

    const userPromptText = `THÔNG TIN ĐỀ KIỂM TRA & BÀI LÀM CẦN CHẤM:
- Tên bài kiểm tra: ${examTitle || 'Kiểm tra môn Ngữ văn'}
- Khối lớp: ${gradeLevel || '11'}
- Trường / Lớp: ${school || 'THPT'} / ${studentClass || '11A'}
- Đề bài:
${examPrompt}

- Đáp án / Hướng dẫn chấm của giáo viên:
${examGuide || 'Giáo viên yêu cầu chấm theo chuẩn kiến thức kỹ năng GDPT 2018.'}

- Thang điểm tối đa: ${maxScore} điểm

- Tiêu chí đánh giá chi tiết:
${criteriaDescription}

- Yêu cầu riêng của giáo viên:
${teacherNotes || 'Không có yêu cầu đặc biệt.'}

- Thông tin học sinh: ${studentName || 'Học sinh'} (Lớp: ${studentClass || 'Chưa rõ'})

- NỘI DUNG BÀI LÀM CỦA HỌC SINH:
${submissionContent || '(Bài làm được đính kèm dưới dạng hình ảnh / tài liệu đính kèm)'}
`;

    const parts: any[] = [];

    // If attachments exist (e.g. photos of handwritten essays), append them
    if (Array.isArray(attachments) && attachments.length > 0) {
      for (const att of attachments) {
        if (att.base64) {
          const clean = att.base64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
          parts.push({
            inlineData: {
              mimeType: att.mimeType || 'image/jpeg',
              data: clean,
            },
          });
        }
      }
    }

    parts.push({ text: userPromptText });

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: { parts },
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
      },
    });

    const rawText = response.text || '{}';
    let parsedResult: any;

    try {
      parsedResult = JSON.parse(rawText);
    } catch {
      // Fallback in case of markdown fences
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      parsedResult = JSON.parse(cleaned);
    }

    // Safety checks on score
    if (typeof parsedResult.totalSuggestedScore !== 'number') {
      const sum = (parsedResult.criteriaGrades || []).reduce(
        (acc: number, item: any) => acc + (Number(item.suggestedScore) || 0),
        0
      );
      parsedResult.totalSuggestedScore = Math.min(Number(maxScore), Math.round(sum * 100) / 100);
    }

    parsedResult.totalSuggestedScore = Math.min(
      Number(maxScore),
      Math.max(0, parsedResult.totalSuggestedScore)
    );

    return res.json({
      success: true,
      data: parsedResult,
      rawGradingTime: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error in /api/grade-essay:', err);
    return res.status(500).json({
      error: 'Lỗi trong quá trình AI chấm bài: ' + (err?.message || 'Lỗi hệ thống'),
    });
  }
});

// API to Generate Literature Exam & Rubric according to GDPT 2018
app.post('/api/generate-exam', async (req: Request, res: Response) => {
  try {
    const {
      mode = 'integrated',
      gradeLevel = '11',
      textbook = 'Kết nối tri thức với cuộc sống',
      examType = 'Kiểm tra giữa học kì',
      durationMinutes = 90,
      school = 'Trường THPT Trần Kỳ Phong',
      topicScope = 'Chủ đề quê hương, đất nước, con người trong văn học hiện đại',
      readingGenre = 'Thơ trữ tình hiện đại',
      writingType = 'Nghị luận xã hội và Nghị luận văn học',
      cognitiveLevels = ['Nhận biết', 'Thông hiểu', 'Vận dụng', 'Vận dụng cao'],
      customPassage = '',
      teacherRequirements = '',
      numCodes = 1,
      weights = { reading: 33.33, paragraph: 33.33, essay: 33.34 },
    } = req.body;

    if (!apiKey) {
      return res.status(500).json({
        error: 'Chưa cấu hình GEMINI_API_KEY trên máy chủ.',
      });
    }

    const modeLabels: Record<string, string> = {
      reading: 'MỤC I – ĐỀ ĐỌC HIỂU (Thang điểm 10)',
      paragraph: 'MỤC II – ĐỀ VIẾT ĐOẠN VĂN (Khoảng 200 chữ - Thang điểm 10)',
      essay: 'MỤC III – ĐỀ VIẾT BÀI VĂN NGHỊ LUẬN (Thang điểm 10)',
      integrated:
        'MỤC IV – ĐỀ TỔNG HỢP: ĐỌC HIỂU (10đ) + VIẾT ĐOẠN VĂN (10đ) + VIẾT BÀI VĂN (10đ) - TỔNG HỢP THANG 10',
    };

    const prompt = `Bạn là Chuyên gia Khảo thí và Phát triển Đề thi Môn Ngữ văn Trung học Phổ thông (THPT) theo Chương trình Giáo dục Phổ thông 2018 (GDPT 2018) của Bộ Giáo dục và Đào tạo Việt Nam.

Nhiệm vụ của bạn là SOẠN THẢO MỘT ĐỀ THI VÀ ĐÁP ÁN - HƯỚNG DẪN CHẤM HOÀN CHỈNH, CHUẨN MỰC SƯ PHẠM, KHÔNG LỖI, BÁM SÁT MA TRẬN GDPT 2018.

THÔNG TIN ĐẦU VÀO:
- Mục tiêu tạo đề: ${modeLabels[mode] || mode}
- Khối lớp: Lớp ${gradeLevel} THPT
- Bộ sách giáo khoa tham chiếu: ${textbook}
- Loại đề: ${examType}
- Thời gian làm bài: ${durationMinutes} phút
- Đơn vị trường: ${school}
- Phạm vi kiến thức, chủ đề, văn bản: ${topicScope || 'Tùy chọn phù hợp chuẩn GDPT 2018'}
- Thể loại văn bản đọc hiểu: ${readingGenre}
- Dạng viết (đoạn/bài văn): ${writingType}
- Các mức độ nhận thức: ${cognitiveLevels.join(', ')}
${customPassage ? `- VĂN BẢN NGUỒN DO GIÁO VIÊN CUNG CẤP (BẮT BUỘC BÁM SÁT):\n"""\n${customPassage}\n"""` : '- Văn bản nguồn: Hãy tuyển chọn một ngữ liệu văn học đặc sắc, giàu giá trị thẩm mĩ, có nguồn gốc xuất xứ rõ ràng (Tác giả, tác phẩm, NXB, năm), không tự bịa đặt trích dẫn.'}
- Yêu cầu riêng của giáo viên: ${teacherRequirements || 'Không có yêu cầu riêng, soạn thảo theo chuẩn mực cao nhất của GDPT 2018.'}
- Số lượng mã đề: ${numCodes}
- Trọng số điểm tổng hợp (cho Mục IV): Đọc hiểu: ${weights.reading}%, Đoạn văn: ${weights.paragraph}%, Bài văn: ${weights.essay}%.

QUY ĐỊNH BẮT BUỘC THEO TỪNG MỤC:

1. NẾU LÀ MỤC I (ĐỀ ĐỌC HIỂU):
   - Ngữ liệu đọc hiểu rõ ràng, nhân văn.
   - 4 hoặc 5 câu hỏi phân hóa theo các mức độ: Nhận biết, Thông hiểu, Vận dụng, Vận dụng cao.
   - Thang điểm tổng cộng: ĐÚNG 10.0 ĐIỂM (Ví dụ: Câu 1: 1.5đ; Câu 2: 2.0đ; Câu 3: 3.0đ; Câu 4: 3.5đ hoặc phân chia hợp lý tổng = 10.0đ).
   - Từng câu hỏi phải có:
     + Yêu cầu câu hỏi
     + Đáp án chính xác/dự kiến
     + Các ý cần đạt kèm điểm thành phần cộng lại bằng điểm câu
     + Tiêu chí xác định đạt, chưa đạt, đạt 1 phần
     + Hướng dẫn chấp nhận cách diễn đạt khác hợp lí
   - Bảng tiêu chí đánh giá gồm 5 cột: Câu hỏi | Yêu cầu cần đạt | Tiêu chí đánh giá | Điểm tối đa | Điểm thành phần.

2. NẾU LÀ MỤC II (ĐỀ VIẾT ĐOẠN VĂN - KHOẢNG 200 CHỮ):
   - Đề bài nêu rõ vấn đề nghị luận (NLXH hoặc NLVH), dung lượng khoảng 200 chữ, yêu cầu lập luận, dẫn chứng.
   - Thang điểm: ĐÚNG 10.0 ĐIỂM.
   - Bảng tiêu chí đánh giá chuẩn (Hình thức đoạn: 1.0đ; Xác định vấn đề: 1.0đ; Triển khai nội dung: 4.0đ; Dẫn chứng & lập luận: 1.5đ; Diễn đạt & sáng tạo: 2.5đ -> Tổng = 10.0đ).
   - Đoạn văn tham khảo hoàn chỉnh, chất lượng cao, đúng chuẩn.
   - Dàn ý chính cần đạt và hướng dẫn chấp nhận góc nhìn riêng có căn cứ.

3. NẾU LÀ MỤC III (ĐỀ VIẾT BÀI VĂN NGHỊ LUẬN):
   - Đề bài rõ ràng, kích thích tư duy phê phán và năng lực thẩm mỹ của học sinh lớp ${gradeLevel}.
   - Thang điểm: ĐÚNG 10.0 ĐIỂM.
   - Bảng tiêu chí đánh giá chuẩn (Bố cục 3 phần: 1.0đ; Xác định vấn đề: 1.0đ; Hệ thống luận điểm: 4.0đ; Lí lẽ & dẫn chứng: 2.0đ; Diễn đạt & sáng tạo: 2.0đ -> Tổng = 10.0đ).
   - Dàn ý chi tiết gồm Mở bài, Thân bài, Kết bài với hệ thống luận điểm, luận cứ gợi ý.
   - Bài văn tham khảo mẫu hoàn chỉnh, đặc sắc.
   - Hướng dẫn chấm linh hoạt, chấp nhận các hướng tiếp cận sáng tạo có căn cứ.

4. NẾU LÀ MỤC IV (ĐỀ TỔNG HỢP: ĐỌC HIỂU + ĐOẠN VĂN + BÀI VĂN):
   - Tích hợp cả 3 phần:
     + Phần I: Đọc hiểu – THANG ĐIỂM 10.0
     + Phần II: Viết đoạn văn (200 chữ) – THANG ĐIỂM 10.0
     + Phần III: Viết bài văn nghị luận – THANG ĐIỂM 10.0
   - Bốn bảng đáp án và tiêu chí tương ứng:
     1. Bảng đáp án & tiêu chí đọc hiểu (thang 10)
     2. Bảng đáp án & tiêu chí viết đoạn văn (thang 10)
     3. Bảng đáp án & tiêu chí viết bài văn nghị luận (thang 10)
     4. Bảng tổng hợp đánh giá toàn bài và công thức quy đổi thang 10.
   - QUY TẮC VÀ CÔNG THỨC TÍNH ĐIỂM TỔNG HỢP:
     Điểm tổng hợp (thang 10) = (Điểm Đọc hiểu x ${weights.reading}% + Điểm Đoạn văn x ${weights.paragraph}% + Điểm Bài văn x ${weights.essay}%) / 100%
     (Nếu trọng số đều 1/3: Điểm tổng hợp = (Điểm Đọc hiểu + Điểm Đoạn văn + Điểm Bài văn) / 3).
     CÔNG THỨC NÀY PHẢI ĐƯỢC THỂ HIỆN RÕ RÀNG TRONG ĐỀ VÀ HƯỚNG DẪN CHẤM!

BẠN PHẢI TRẢ VỀ DUY NHẤT MỘT ĐỐI TƯỢNG JSON (KHÔNG KÈM TEXT HAY BÌNH LUẬN BÊN NGOÀI) theo đúng cấu trúc sau:

{
  "title": "Tên bài kiểm tra (ví dụ: ĐỀ KIỂM TRA ĐỊNH KỲ HỌC KỲ I - MÔN NGỮ VĂN KHỐI 11)",
  "school": "${school}",
  "examType": "${examType}",
  "gradeLevel": "${gradeLevel}",
  "textbook": "${textbook}",
  "durationMinutes": ${durationMinutes},
  "examCodes": ["101"${numCodes > 1 ? ', "102"' : ''}],
  
  "readingSection": {
    "passage": {
      "title": "Tên trích đoạn / bài thơ",
      "text": "Toàn văn ngữ liệu đọc hiểu đầy đủ...",
      "author": "Tên tác giả",
      "source": "Tập thơ / Tác phẩm / NXB / Năm xuất bản",
      "contextNotes": "Chú thích ngắn (nếu có)"
    },
    "questions": [
      {
        "questionNumber": 1,
        "level": "Nhận biết",
        "content": "Nội dung câu hỏi...",
        "maxScore": 1.5,
        "expectedAnswer": "Đáp án câu 1...",
        "requiredPoints": [
          {"point": "Ý 1 cần đạt", "score": 1.0},
          {"point": "Ý 2 cần đạt", "score": 0.5}
        ],
        "evaluationCriteria": "Tiêu chí đạt/chưa đạt...",
        "acceptableAlternatives": "Cách diễn đạt khác được chấp nhận...",
        "toleranceGuide": "Hướng dẫn xử lý câu trả lời hợp lý nhưng khác đáp án mẫu..."
      }
    ],
    "totalMaxScore": 10.0,
    "rubricTable": [
      {
        "question": "Câu 1",
        "expectedOutcome": "Yêu cầu cần đạt...",
        "evaluationCriteria": "Tiêu chí chấm...",
        "maxScore": 1.5,
        "componentScores": "0.5đ - 1.0đ - 1.5đ"
      }
    ]
  },

  "paragraphSection": {
    "prompt": "Đề bài viết đoạn văn khoảng 200 chữ...",
    "topicType": "Nghị luận xã hội về lối sống / tư tưởng / hiện tượng",
    "targetLength": "Khoảng 200 chữ (khoảng 20-25 dòng)",
    "contentRequirements": "Yêu cầu cụ thể về lập luận và dẫn chứng...",
    "rubricCriteria": [
      {
        "criterion": "Hình thức và cấu trúc đoạn văn",
        "requirement": "Đúng thể thức đoạn 200 chữ, không ngắt đoạn tùy tiện, có mở - thân - kết đoạn",
        "maxScore": 1.0,
        "excellentDescription": "Đúng dung lượng, cấu trúc đoạn mạch lạc",
        "goodDescription": "Còn đôi chỗ lệch dung lượng hoặc câu liên kết lỏng",
        "notMetDescription": "Ngắt nhiều đoạn, quá dài hoặc quá ngắn"
      },
      {
        "criterion": "Xác định vấn đề nghị luận",
        "requirement": "Xác định đúng trọng tâm vấn đề",
        "maxScore": 1.0,
        "excellentDescription": "Nêu đúng, rõ vấn đề",
        "goodDescription": "Nêu được vấn đề nhưng chưa nổi bật",
        "notMetDescription": "Xác định sai vấn đề"
      },
      {
        "criterion": "Triển khai nội dung",
        "requirement": "Giải thích, bàn luận, phân tích đa chiều",
        "maxScore": 4.0,
        "excellentDescription": "Lập luận sắc bén, sâu sắc, thuyết phục",
        "goodDescription": "Nội dung cơ bản đạt, lập luận chưa sâu",
        "notMetDescription": "Nội dung sơ sài, lạc đề"
      },
      {
        "criterion": "Dẫn chứng và cách lập luận",
        "requirement": "Dẫn chứng xác thực, thời sự, thuyết phục",
        "maxScore": 1.5,
        "excellentDescription": "Dẫn chứng mới mẻ, tiêu biểu",
        "goodDescription": "Dẫn chứng chung chung",
        "notMetDescription": "Không có dẫn chứng hoặc dẫn chứng sai"
      },
      {
        "criterion": "Diễn đạt và sáng tạo",
        "requirement": "Hành văn trong sáng, góc nhìn mới mẻ",
        "maxScore": 2.5,
        "excellentDescription": "Giàu cảm xúc, câu văn linh hoạt, sáng tạo",
        "goodDescription": "Diễn đạt rõ ràng, ít lỗi",
        "notMetDescription": "Mắc nhiều lỗi chính tả, ngữ pháp"
      }
    ],
    "totalMaxScore": 10.0,
    "referenceSample": "Đoạn văn tham khảo hoàn chỉnh đạt điểm tối đa...",
    "mainOutline": [
      "1. Mở đoạn: Dẫn dắt và giới thiệu vấn đề",
      "2. Thân đoạn: Giải thích ngắn gọn; Bàn luận lí do và ý nghĩa; Dẫn chứng tiêu biểu; Phản đề hoặc bài học hành động",
      "3. Kết đoạn: Khẳng định thông điệp bản thân"
    ],
    "toleranceGuide": "Chấp nhận các quan điểm, dẫn chứng phong phú miễn là có căn cứ thuyết phục và văn hóa."
  },

  "essaySection": {
    "prompt": "Đề bài viết bài văn nghị luận hoàn chỉnh...",
    "topicType": "Nghị luận văn học / Nghị luận xã hội",
    "contentRequirements": "Yêu cầu cụ thể về bố cục, lập luận và kiến thức...",
    "rubricCriteria": [
      {
        "criterion": "Bố cục và cấu trúc bài văn",
        "requirement": "Đầy đủ Mở bài - Thân bài - Kết bài",
        "maxScore": 1.0,
        "excellentDescription": "Bố cục chuẩn, liên kết chặt chẽ",
        "goodDescription": "Đủ 3 phần nhưng chuyển ý chưa mượt",
        "notMetDescription": "Thiếu phần mở/kết bài, bố cục lộn xộn"
      },
      {
        "criterion": "Xác định vấn đề nghị luận",
        "requirement": "Xác định đúng, sâu sắc vấn đề đề bài đặt ra",
        "maxScore": 1.0,
        "excellentDescription": "Nêu vấn đề sâu sắc, toàn diện",
        "goodDescription": "Nêu được vấn đề ở mức cơ bản",
        "notMetDescription": "Lạc đề hoặc hiểu sai vấn đề"
      },
      {
        "criterion": "Triển khai hệ thống luận điểm",
        "requirement": "Hệ thống luận điểm sáng rõ, lập luận có chiều sâu",
        "maxScore": 4.0,
        "excellentDescription": "Phân tích tinh tế, bao quát các khía cạnh",
        "goodDescription": "Đủ luận điểm nhưng phân tích còn đều đều",
        "notMetDescription": "Luận điểm rời rạc, nghèo nàn"
      },
      {
        "criterion": "Lí lẽ và dẫn chứng",
        "requirement": "Dẫn chứng chính xác, lí lẽ sắc sảo",
        "maxScore": 2.0,
        "excellentDescription": "Dẫn chứng đắt giá, phân tích sâu",
        "goodDescription": "Dẫn chứng phù hợp nhưng phân tích sơ",
        "notMetDescription": "Dẫn chứng sai hoặc thiếu thuyết phục"
      },
      {
        "criterion": "Diễn đạt và sáng tạo",
        "requirement": "Văn phong giàu chất văn, tư duy sáng tạo",
        "maxScore": 2.0,
        "excellentDescription": "Lời văn mượt mà, phát hiện mới mẻ độc đáo",
        "goodDescription": "Diễn đạt lưu loát, đúng chuẩn ngữ pháp",
        "notMetDescription": "Văn nôm na, mắc nhiều lỗi chính tả"
      }
    ],
    "totalMaxScore": 10.0,
    "detailedOutline": {
      "introduction": "Dẫn dắt, nêu vấn đề và giới hạn phạm vi bài viết...",
      "body": [
        "Luận điểm 1: Giải thích / Khái quát bối cảnh tác phẩm / vấn đề...",
        "Luận điểm 2: Phân tích chi tiết các biểu hiện nghệ thuật / nội dung...",
        "Luận điểm 3: Đánh giá chiều sâu tư tưởng, cảm xúc thẩm mĩ...",
        "Luận điểm 4: Mở rộng, so sánh và liên hệ thực tiễn..."
      ],
      "conclusion": "Khái quát lại giá trị vấn đề và rút ra thông điệp trường tồn..."
    },
    "suggestedArgumentsAndEvidence": [
      "Luận cứ 1: Phân tích chi tiết hình ảnh, từ ngữ đặc sắc...",
      "Luận cứ 2: Dẫn chứng đối sánh để làm bật phong cách nghệ thuật..."
    ],
    "referenceSample": "Toàn văn bài viết văn mẫu chất lượng cao tham khảo...",
    "toleranceGuide": "Tôn trọng cách cảm thụ và phân tích độc lập của học sinh nếu có căn cứ xác đáng."
  },

  "integratedFormula": {
    "formulaText": "Điểm toàn bài (thang 10) = (Điểm Đọc hiểu x ${weights.reading} + Điểm Đoạn văn x ${weights.paragraph} + Điểm Bài văn x ${weights.essay}) / 100",
    "readingWeight": ${weights.reading},
    "paragraphWeight": ${weights.paragraph},
    "essayWeight": ${weights.essay},
    "overallScale": 10.0,
    "overallEvaluationTable": [
      {
        "component": "Phần I: Đọc hiểu",
        "scale": "Thang 10.0 điểm",
        "weight": "${weights.reading}%",
        "conversionFormula": "Điểm thành phần x ${weights.reading / 100}"
      },
      {
        "component": "Phần II: Viết đoạn văn (200 chữ)",
        "scale": "Thang 10.0 điểm",
        "weight": "${weights.paragraph}%",
        "conversionFormula": "Điểm thành phần x ${weights.paragraph / 100}"
      },
      {
        "component": "Phần III: Viết bài văn nghị luận",
        "scale": "Thang 10.0 điểm",
        "weight": "${weights.essay}%",
        "conversionFormula": "Điểm thành phần x ${weights.essay / 100}"
      },
      {
        "component": "TỔNG HỢP TOÀN BÀI",
        "scale": "Thang 10.0 điểm",
        "weight": "100%",
        "conversionFormula": "Tổng điểm 3 phần sau khi nhân trọng số"
      }
    ]
  }
}

LƯU Ý QUAN TRỌNG:
- Chỉ trả về các phần liên quan đến mục tiêu được chọn:
  + Nếu mode = "reading": chỉ cần readingSection đầy đủ, các mục khác có thể bỏ trống hoặc rút gọn.
  + Nếu mode = "paragraph": chỉ cần paragraphSection đầy đủ.
  + Nếu mode = "essay": chỉ cần essaySection đầy đủ.
  + Nếu mode = "integrated": BẮT BUỘC ĐẦY ĐỦ readingSection, paragraphSection, essaySection VÀ integratedFormula.
- Toàn bộ nội dung bằng tiếng Việt chuẩn ngữ pháp, không viết tắt vô căn cứ, bố cục trang trọng, đúng văn phong đề thi THPT của Sở GD&ĐT.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const rawText = response.text || '{}';
    let examData: any;
    try {
      examData = JSON.parse(rawText);
    } catch {
      const cleaned = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();
      examData = JSON.parse(cleaned);
    }

    // Build the formatted document strings for student exam & teacher guide
    const title =
      examData.title ||
      `ĐỀ KIỂM TRA MÔN NGỮ VĂN KHỐI ${gradeLevel} – NĂM HỌC 2026-2027`;

    // Construct Student Document
    let studentDoc = `SỞ GIÁO DỤC VÀ ĐÀO TẠO\n${school.toUpperCase()}\n\n`;
    studentDoc += `${title.toUpperCase()}\n`;
    studentDoc += `Môn: Ngữ văn - Khối ${gradeLevel} (${textbook})\n`;
    studentDoc += `Thời gian làm bài: ${durationMinutes} phút (không kể thời gian phát đề)\n`;
    if (examData.examCodes && examData.examCodes.length > 0) {
      studentDoc += `Mã đề thi: ${examData.examCodes.join(', ')}\n`;
    }
    studentDoc += `--------------------------------------------------\n\n`;

    if (mode === 'reading' || mode === 'integrated') {
      const rs = examData.readingSection;
      if (rs) {
        studentDoc += `I. PHẦN ĐỌC HIỂU (Thang điểm: 10.0 điểm)\n`;
        if (rs.passage) {
          studentDoc += `Đọc đoạn trích sau và thực hiện các yêu cầu:\n\n`;
          if (rs.passage.title) studentDoc += `"${rs.passage.title}"\n`;
          studentDoc += `${rs.passage.text}\n\n`;
          if (rs.passage.author || rs.passage.source) {
            studentDoc += `(${rs.passage.author ? rs.passage.author + ', ' : ''}${rs.passage.source || ''})\n\n`;
          }
        }
        if (Array.isArray(rs.questions)) {
          rs.questions.forEach((q: any, i: number) => {
            studentDoc += `Câu ${q.questionNumber || i + 1} (${q.maxScore} điểm) [${q.level || 'Đọc hiểu'}]: ${q.content}\n`;
          });
        }
        studentDoc += `\n`;
      }
    }

    if (mode === 'paragraph' || mode === 'integrated') {
      const ps = examData.paragraphSection;
      if (ps) {
        studentDoc += `${mode === 'integrated' ? 'II. PHẦN VIẾT ĐOẠN VĂN' : 'PHẦN VIẾT ĐOẠN VĂN'} (Thang điểm: 10.0 điểm)\n`;
        studentDoc += `Đề bài: ${ps.prompt}\n`;
        studentDoc += `(Dung lượng: ${ps.targetLength || 'Khoảng 200 chữ'})\n\n`;
      }
    }

    if (mode === 'essay' || mode === 'integrated') {
      const es = examData.essaySection;
      if (es) {
        studentDoc += `${mode === 'integrated' ? 'III. PHẦN VIẾT BÀI VĂN NGHỊ LUẬN' : 'PHẦN VIẾT BÀI VĂN NGHỊ LUẬN'} (Thang điểm: 10.0 điểm)\n`;
        studentDoc += `Đề bài: ${es.prompt}\n\n`;
      }
    }

    if (mode === 'integrated' && examData.integratedFormula) {
      studentDoc += `* HƯỚNG DẪN QUY ĐỔI ĐIỂM TOÀN BÀI:\n`;
      studentDoc += `${examData.integratedFormula.formulaText}\n`;
    }
    studentDoc += `\n----------------- HẾT -----------------\nThí sinh không được sử dụng tài liệu. Cán bộ coi thi không giải thích gì thêm.\n`;

    // Construct Teacher Guide Document
    let teacherDoc = `HƯỚNG DẪN CHẤM VÀ ĐÁP ÁN CHI TIẾT THEO CHUẨN GDPT 2018\n`;
    teacherDoc += `${title.toUpperCase()}\n`;
    teacherDoc += `Đơn vị: ${school} • Khối lớp: ${gradeLevel} • Thời gian: ${durationMinutes} phút\n\n`;

    if (mode === 'reading' || mode === 'integrated') {
      const rs = examData.readingSection;
      if (rs) {
        teacherDoc += `A. HƯỚNG DẪN CHẤM PHẦN ĐỌC HIỂU (Thang điểm 10.0):\n`;
        if (Array.isArray(rs.questions)) {
          rs.questions.forEach((q: any, i: number) => {
            teacherDoc += `Câu ${q.questionNumber || i + 1} (${q.maxScore} điểm) - Mức độ: ${q.level}\n`;
            teacherDoc += `- Yêu cầu / Đáp án chính: ${q.expectedAnswer}\n`;
            if (Array.isArray(q.requiredPoints) && q.requiredPoints.length > 0) {
              teacherDoc += `- Các ý cần đạt & điểm chi tiết:\n`;
              q.requiredPoints.forEach((p: any) => {
                teacherDoc += `  + ${p.point}: ${p.score} điểm\n`;
              });
            }
            if (q.acceptableAlternatives) {
              teacherDoc += `- Chấp nhận cách diễn đạt khác: ${q.acceptableAlternatives}\n`;
            }
            if (q.toleranceGuide) {
              teacherDoc += `- Hướng dẫn xử lý linh hoạt: ${q.toleranceGuide}\n`;
            }
            teacherDoc += `\n`;
          });
        }
      }
    }

    if (mode === 'paragraph' || mode === 'integrated') {
      const ps = examData.paragraphSection;
      if (ps) {
        teacherDoc += `B. HƯỚNG DẪN CHẤM PHẦN VIẾT ĐOẠN VĂN (Thang điểm 10.0):\n`;
        teacherDoc += `- Đề bài: ${ps.prompt}\n`;
        teacherDoc += `- Dàn ý cơ bản:\n`;
        if (Array.isArray(ps.mainOutline)) {
          ps.mainOutline.forEach((item: string) => (teacherDoc += `  + ${item}\n`));
        }
        teacherDoc += `- Đoạn văn tham khảo:\n${ps.referenceSample}\n\n`;
        teacherDoc += `- Lưu ý chấm: ${ps.toleranceGuide}\n\n`;
      }
    }

    if (mode === 'essay' || mode === 'integrated') {
      const es = examData.essaySection;
      if (es) {
        teacherDoc += `C. HƯỚNG DẪN CHẤM PHẦN VIẾT BÀI VĂN NGHỊ LUẬN (Thang điểm 10.0):\n`;
        teacherDoc += `- Đề bài: ${es.prompt}\n`;
        if (es.detailedOutline) {
          teacherDoc += `- Dàn ý chi tiết:\n`;
          teacherDoc += `  + Mở bài: ${es.detailedOutline.introduction}\n`;
          if (Array.isArray(es.detailedOutline.body)) {
            teacherDoc += `  + Thân bài:\n`;
            es.detailedOutline.body.forEach((b: string) => (teacherDoc += `    * ${b}\n`));
          }
          teacherDoc += `  + Kết bài: ${es.detailedOutline.conclusion}\n`;
        }
        teacherDoc += `\n- Bài văn tham khảo:\n${es.referenceSample}\n\n`;
        teacherDoc += `- Lưu ý chấm: ${es.toleranceGuide}\n\n`;
      }
    }

    if (mode === 'integrated' && examData.integratedFormula) {
      teacherDoc += `D. CÔNG THỨC VÀ BẢNG QUY ĐỔI ĐIỂM TỔNG HỢP TOÀN BÀI (Thang điểm 10):\n`;
      teacherDoc += `${examData.integratedFormula.formulaText}\n`;
      teacherDoc += `Trong đó: Điểm Đọc hiểu (thang 10) chiếm ${weights.reading}%, Điểm Đoạn văn (thang 10) chiếm ${weights.paragraph}%, Điểm Bài văn (thang 10) chiếm ${weights.essay}%.\n`;
    }

    examData.id = 'gen-exam-' + Date.now();
    examData.mode = mode;
    examData.createdAt = new Date().toISOString();
    examData.studentExamDocument = studentDoc;
    examData.teacherAnswerAndRubricDocument = teacherDoc;

    return res.json({
      success: true,
      data: examData,
    });
  } catch (err: any) {
    console.error('Error in /api/generate-exam:', err);
    return res.status(500).json({
      error: 'Lỗi trong quá trình tạo đề thi và đáp án: ' + (err?.message || 'Lỗi hệ thống'),
    });
  }
});

// Setup Vite middleware in dev or static files in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
