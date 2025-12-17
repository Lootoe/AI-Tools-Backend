import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import FormData from 'form-data';
import https from 'https';

export const uploadRouter = Router();

// ImgBB API
const IMGBB_API_KEY = 'c46155dfd4520726df5066d18655cc53';

// 配置 multer 存储在内存中
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 }, // 32MB
});

// ImgBB API 响应类型
interface ImgBBResponse {
  success: boolean;
  status: number;
  data?: {
    url: string;
    display_url: string;
    thumb?: {
      url: string;
    };
  };
  error?: {
    message: string;
  };
}

// 使用 https 模块发送 FormData
function uploadToImgBB(formData: FormData): Promise<ImgBBResponse> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.imgbb.com',
        port: 443,
        path: `/1/upload?key=${IMGBB_API_KEY}`,
        method: 'POST',
        headers: formData.getHeaders(),
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`无法解析响应: ${data.substring(0, 200)}`));
          }
        });
      }
    );

    req.on('error', reject);
    formData.pipe(req);
  });
}

// 上传图片到 ImgBB
uploadRouter.post('/image', upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;

    console.log('=== 收到上传请求 ===');
    console.log('文件:', file?.originalname, file?.size, 'bytes');

    if (!file) {
      return res.status(400).json({ error: '请提供图片文件' });
    }

    // 构建 FormData
    const formData = new FormData();
    formData.append('image', file.buffer, {
      filename: file.originalname,
      contentType: file.mimetype,
    });

    console.log('=== 发送请求到 ImgBB ===');

    const data = await uploadToImgBB(formData);

    console.log('=== ImgBB 响应 ===');
    console.log('状态:', data.success ? '成功' : '失败');

    if (data.success && data.data?.url) {
      console.log('图片URL:', data.data.url);
      res.json({
        success: true,
        url: data.data.url,
        displayUrl: data.data.display_url,
        thumbUrl: data.data.thumb?.url,
      });
    } else {
      console.error('ImgBB upload failed:', data);
      throw new Error(`图片上传失败: ${data.error?.message || '未知错误'}`);
    }
  } catch (error) {
    console.error('Upload error:', error);
    next(error);
  }
});
