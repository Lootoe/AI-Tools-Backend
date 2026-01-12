import qiniu from 'qiniu';

// 七牛云配置
const accessKey = process.env.QINIU_ACCESS_KEY || '';
const secretKey = process.env.QINIU_SECRET_KEY || '';
const bucket = process.env.QINIU_BUCKET || '';
const domain = process.env.QINIU_DOMAIN || '';

// 打印配置检查（调试用）
console.log('=== 七牛云配置 ===');
console.log('AccessKey:', accessKey ? `${accessKey.substring(0, 8)}...` : '未配置');
console.log('SecretKey:', secretKey ? `${secretKey.substring(0, 8)}...` : '未配置');
console.log('Bucket:', bucket || '未配置');
console.log('Domain:', domain || '未配置');

// 鉴权对象
const mac = new qiniu.auth.digest.Mac(accessKey, secretKey);

// 配置
const config = new qiniu.conf.Config();
// 华北区域
config.zone = qiniu.zone.Zone_z1;

// 资源管理
const bucketManager = new qiniu.rs.BucketManager(mac, config);

/**
 * 生成上传凭证
 */
export function generateUploadToken(keyPrefix?: string, expires: number = 3600) {
    const putPolicy = new qiniu.rs.PutPolicy({
        scope: keyPrefix ? `${bucket}:${keyPrefix}` : bucket,
        expires,
        returnBody: JSON.stringify({
            key: '$(key)',
            hash: '$(etag)',
            size: '$(fsize)',
            mimeType: '$(mimeType)',
            url: `${domain}/$(key)`,
        }),
    });

    return { token: putPolicy.uploadToken(mac), domain, bucket, key: keyPrefix };
}

/**
 * 生成带文件名的上传凭证（覆盖上传）
 */
export function generateUploadTokenWithKey(key: string, expires: number = 3600) {
    const putPolicy = new qiniu.rs.PutPolicy({
        scope: `${bucket}:${key}`,
        expires,
        returnBody: JSON.stringify({
            key: '$(key)',
            hash: '$(etag)',
            size: '$(fsize)',
            mimeType: '$(mimeType)',
            url: `${domain}/$(key)`,
        }),
    });

    return { token: putPolicy.uploadToken(mac), domain, key };
}

/**
 * 生成文件访问 URL
 */
export function getFileUrl(key: string, isPrivate = false, expires = 3600): string {
    const baseUrl = `${domain}/${key}`;
    return isPrivate ? bucketManager.privateDownloadUrl(baseUrl, expires) : baseUrl;
}

/**
 * 删除文件
 */
export function deleteFile(key: string): Promise<void> {
    return new Promise((resolve, reject) => {
        bucketManager.delete(bucket, key, (err, _respBody, _respInfo) => (err ? reject(err) : resolve()));
    });
}

/**
 * 从 URL 抓取文件到七牛云（用于保存 AI 生成的图片）
 */
export function fetchFromUrl(url: string, key: string): Promise<{ key: string; hash: string; url: string }> {
    return new Promise((resolve, reject) => {
        bucketManager.fetch(url, bucket, key, (err, respBody) => {
            if (err) reject(err);
            else resolve({ key: respBody.key, hash: respBody.hash, url: `${domain}/${respBody.key}` });
        });
    });
}

export { bucket, domain };
