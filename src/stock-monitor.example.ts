import { monitorStock } from './index';

const main = async () => {
  // 启动监控
  await monitorStock(
    [
      {
        request: { platform: 'yishou', productId: '269723157' },
        recipient: '473149942@qq.com',
        subject: '商品到货提醒',
      },
      {
        request: { platform: 'yishou', productId: '269723407' },
        recipient: '473149942@qq.com',
        subject: '商品到货提醒',
      },
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
      interval: 1,
      duration: 3 * 60 * 60,
      adapterConfig: {},
    },
    progress => console.log(`进度: ${progress.progress}%`),
    result => console.log(`${result.productName}: ${result.detected ? '已到货' : '未检测到'}`),
  );
};

void main();

