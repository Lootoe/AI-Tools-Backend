import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import qiniu from 'qiniu';
import { generateUploadToken, generateUploadTokenWithKey, fetchFromUrl, domain } from '../lib/qiniu.js';

export const uploadRouter = Router();

// 配置 multer 存储在内存中
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 32 * 1024 * 1024 }, // 32MB
});

// 生成文件名
function generateKey(originalName: string, prefix: string = 'uploads'): string {
  const ext = originalName.split('.').pop() || 'jpg';
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `${prefix}/${timestamp}-${random}.${ext}`;
}

// 获取上传凭证（前端直传用）
uploadRouter.get('/token', (req: Request, res: Response) => {
  try {
    const { filename, prefix = 'uploads' } = req.query;

    let result;
    if (filename && typeof filename === 'string') {
      const key = generateKey(filename, prefix as string);
      result = generateUploadTokenWithKey(key);
    } else {
      result = generateUploadToken();
    }

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('生成上传凭证失败:', error);
    res.status(500).json({ error: '生成上传凭证失败' });
  }
});

// 服务端上传图片到七牛云
uploadRouter.post('/image', upload.single('image'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const file = req.file;
    const prefix = (req.body.prefix as string) || 'uploads';

    console.log('=== 收到上传请求 ===');
    console.log('文件:', file?.originalname, file?.size, 'bytes');

    if (!file) {
      return res.status(400).json({ error: '请提供图片文件' });
    }

    const key = generateKey(file.originalname, prefix);
    const { token } = generateUploadTokenWithKey(key);

    // 使用七牛云 SDK 上传
    const config = new qiniu.conf.Config();
    // 指定存储区域（华北 z1）
    config.zone = qiniu.zone.Zone_z1;

    const formUploader = new qiniu.form_up.FormUploader(config);
    const putExtra = new qiniu.form_up.PutExtra();

    const uploadResult = await new Promise<{ key: string; hash: string }>((resolve, reject) => {
      formUploader.put(token, key, file.buffer, putExtra, (err, body, info) => {
        if (err) {
          reject(err);
        } else if (info.statusCode === 200) {
          resolve(body);
        } else {
          reject(new Error(`上传失败: ${info.statusCode} - ${JSON.stringify(body)}`));
        }
      });
    });

    const url = `${domain}/${uploadResult.key}`;
    console.log('=== 七牛云上传成功 ===');
    console.log('图片URL:', url);

    res.json({
      success: true,
      url,
      key: uploadResult.key,
      hash: uploadResult.hash,
    });
  } catch (error) {
    console.error('Upload error:', error);
    next(error);
  }
});

// 从 URL 抓取图片到七牛云（用于保存 AI 生成的图片）
uploadRouter.post('/fetch', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { url, prefix = 'ai-generated' } = req.body;

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: '请提供图片 URL' });
    }

    const ext = url.split('.').pop()?.split('?')[0] || 'png';
    const key = generateKey(`image.${ext}`, prefix);

    console.log('=== 抓取图片到七牛云 ===');
    console.log('源URL:', url);
    console.log('目标Key:', key);

    const result = await fetchFromUrl(url, key);

    console.log('=== 抓取成功 ===');
    console.log('七牛云URL:', result.url);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Fetch error:', error);
    next(error);
  }
});
