import { configureEmailService, monitorStock } from './index';

const main = async () => {
  // 配置邮件服务
  configureEmailService({
    host: 'smtp.qq.com',
    port: 465,
    user: 'sumsalt@qq.com',
    pass: 'drkrrwyavsbzbjib',
    secure: true,
  });

  // 启动监控
  await monitorStock(
    [
      {
        request: { platform: 'yishou', productId: '269723442' },
        recipient: '473149942@qq.com',
        subject: '商品到货提醒',
      },
      {
        request: { platform: 'yishou', productId: '269696713' },
        recipient: '473149942@qq.com',
        subject: '商品到货提醒',
      },
    ],
    {
      interval: 2,
      duration: 3600,
      adapterConfig: {},
    },
    progress => console.log(`进度: ${progress.progress}%`),
    result => console.log(`${result.productName}: ${result.detected ? '已到货' : '未检测到'}`),
  );
};

void main();

