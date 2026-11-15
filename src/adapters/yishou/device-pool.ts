/**
 * 一手 Android 虚拟设备池
 *
 * 密码登录会给每个账号分配一台「虚拟设备」，设备参数直接影响请求像不像真机。
 * 池子放在这里单独维护：新增机型 = 往数组里加一条，不需要动登录逻辑。
 *
 * 数据口径（很重要，新增时请对齐）：
 *   1. `model` 是真机 `ro.product.model`，也是签名原料之一，必须与厂商一致；
 *      来源：Google Play 官方支持设备列表 supported_devices.csv（Model 列）。
 *   2. `manufacturer` 是 `ro.product.manufacturer` 的上报值，不是品牌名：
 *      Redmi / POCO 上报 `Xiaomi`，iQOO 上报 `vivo`。
 *   3. `screenWidth / screenHeight` 用**物理分辨率**（厂商公开参数），
 *      不是抓包里那种扣掉系统栏的可用高度。
 *   4. `osVersions` 是该机型现实中会上报的 Android 大版本（出厂版及后续升级），
 *      抽取时随机取一个；低于 11 的版本不收，太老的系统反而不像在用的机器。
 *   5. `weight` 是抽取权重，按机型保有量给：新机 3、上一代 2、老机 1。
 *
 * 来源标记：
 *   - `capture`：一手真实抓包（线上账号快照），设备组合已被平台接受
 *   - `play-supported-devices`：Google Play 官方支持设备列表
 *   - `vendor-spec`：厂商官网 / 公开规格页（Play 列表未收录的国内机型）
 */

/** 设备数据来源 */
export type DevicePresetSource = 'capture' | 'play-supported-devices' | 'vendor-spec';

/** 一台虚拟设备的机型模板 */
export interface YishouDevicePreset {
  /** ro.product.model，参与签名，必须准确 */
  model: string;
  /** ro.product.manufacturer 上报值 */
  manufacturer: string;
  /** 品牌，仅用于分组与阅读，不参与请求 */
  brand: string;
  /** 物理宽度（px） */
  screenWidth: string;
  /** 物理高度（px） */
  screenHeight: string;
  /** 该机型现实中会上报的 Android 大版本 */
  osVersions: readonly string[];
  /** 上市年份，用于判断系统版本是否合理 */
  releaseYear: number;
  /** 抽取权重，按保有量给 */
  weight: number;
  source: DevicePresetSource;
}

/**
 * 设备池
 *
 * 覆盖 2021–2025 年国内主流品牌，含 4 台一手真实抓包设备作为基线。
 * 新增机型前先确认三件事：型号在厂商/Play 列表里存在、manufacturer 上报值正确、
 * 分辨率与系统版本对得上。
 */
export const YISHOU_DEVICE_POOL: readonly YishouDevicePreset[] = [
  // ========== Xiaomi / Redmi / POCO（manufacturer 统一上报 Xiaomi）==========
  {
    model: '23127PN0CC',
    manufacturer: 'Xiaomi',
    brand: 'Xiaomi',
    screenWidth: '1200',
    screenHeight: '2670',
    osVersions: ['14', '15'],
    releaseYear: 2023,
    weight: 3,
    source: 'play-supported-devices',
  },
  {
    model: '24031PN0DC',
    manufacturer: 'Xiaomi',
    brand: 'Xiaomi',
    screenWidth: '1440',
    screenHeight: '3200',
    osVersions: ['14', '15'],
    releaseYear: 2024,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: '2211133C',
    manufacturer: 'Xiaomi',
    brand: 'Xiaomi',
    screenWidth: '1080',
    screenHeight: '2400',
    osVersions: ['13', '14'],
    releaseYear: 2022,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: '23013RK75C',
    manufacturer: 'Xiaomi',
    brand: 'Redmi',
    screenWidth: '1220',
    screenHeight: '2712',
    osVersions: ['13', '14'],
    releaseYear: 2022,
    weight: 3,
    source: 'play-supported-devices',
  },
  {
    model: '23113RKC6C',
    manufacturer: 'Xiaomi',
    brand: 'Redmi',
    screenWidth: '1220',
    screenHeight: '2712',
    osVersions: ['14', '15'],
    releaseYear: 2023,
    weight: 3,
    source: 'play-supported-devices',
  },
  {
    model: 'M2012K11AC',
    manufacturer: 'Xiaomi',
    brand: 'Redmi',
    screenWidth: '1080',
    screenHeight: '2400',
    osVersions: ['12', '13'],
    releaseYear: 2021,
    weight: 1,
    source: 'play-supported-devices',
  },
  {
    model: '22101316C',
    manufacturer: 'Xiaomi',
    brand: 'Redmi',
    screenWidth: '1080',
    screenHeight: '2400',
    osVersions: ['12', '13'],
    releaseYear: 2022,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: '23090RA98C',
    manufacturer: 'Xiaomi',
    brand: 'Redmi',
    screenWidth: '1220',
    screenHeight: '2712',
    osVersions: ['13', '14'],
    releaseYear: 2023,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: '23049PCD8G',
    manufacturer: 'Xiaomi',
    brand: 'POCO',
    screenWidth: '1080',
    screenHeight: '2400',
    osVersions: ['13', '14'],
    releaseYear: 2023,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: 'M1906G7E',
    manufacturer: 'Xiaomi',
    brand: 'Redmi',
    screenWidth: '1080',
    screenHeight: '2204',
    osVersions: ['15'],
    releaseYear: 2019,
    weight: 1,
    source: 'capture',
  },

  // ========== Samsung ==========
  {
    model: 'SM-S9210',
    manufacturer: 'SAMSUNG',
    brand: 'Samsung',
    screenWidth: '1080',
    screenHeight: '2340',
    osVersions: ['14', '15'],
    releaseYear: 2024,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: 'SM-S9110',
    manufacturer: 'SAMSUNG',
    brand: 'Samsung',
    screenWidth: '1080',
    screenHeight: '2340',
    osVersions: ['13', '14'],
    releaseYear: 2023,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: 'SM-G9910',
    manufacturer: 'SAMSUNG',
    brand: 'Samsung',
    screenWidth: '1080',
    screenHeight: '2400',
    osVersions: ['12', '13'],
    releaseYear: 2021,
    weight: 1,
    source: 'capture',
  },
  {
    model: 'SM-A5460',
    manufacturer: 'SAMSUNG',
    brand: 'Samsung',
    screenWidth: '1080',
    screenHeight: '2340',
    osVersions: ['13', '14'],
    releaseYear: 2023,
    weight: 2,
    source: 'play-supported-devices',
  },

  // ========== vivo / iQOO（iQOO 上报 vivo）==========
  {
    model: 'V2309A',
    manufacturer: 'vivo',
    brand: 'vivo',
    screenWidth: '1260',
    screenHeight: '2800',
    osVersions: ['14', '15'],
    releaseYear: 2023,
    weight: 3,
    source: 'play-supported-devices',
  },
  {
    model: 'V2318A',
    manufacturer: 'vivo',
    brand: 'vivo',
    screenWidth: '1080',
    screenHeight: '2408',
    osVersions: ['13', '14'],
    releaseYear: 2023,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: 'V2243A',
    manufacturer: 'vivo',
    brand: 'iQOO',
    screenWidth: '1440',
    screenHeight: '3200',
    osVersions: ['13', '14'],
    releaseYear: 2022,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: 'V1938T',
    manufacturer: 'vivo',
    brand: 'vivo',
    screenWidth: '1080',
    screenHeight: '2204',
    osVersions: ['12', '15'],
    releaseYear: 2020,
    weight: 1,
    source: 'capture',
  },

  // ========== OPPO / OnePlus / realme ==========
  {
    model: 'PJZ110',
    manufacturer: 'OnePlus',
    brand: 'OnePlus',
    screenWidth: '1440',
    screenHeight: '3168',
    osVersions: ['15'],
    releaseYear: 2024,
    weight: 3,
    source: 'play-supported-devices',
  },
  {
    model: 'PJD110',
    manufacturer: 'OnePlus',
    brand: 'OnePlus',
    screenWidth: '1440',
    screenHeight: '3168',
    osVersions: ['14', '15'],
    releaseYear: 2023,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: 'LE2100',
    manufacturer: 'OnePlus',
    brand: 'OnePlus',
    screenWidth: '1080',
    screenHeight: '2400',
    osVersions: ['12', '13'],
    releaseYear: 2021,
    weight: 1,
    source: 'play-supported-devices',
  },
  {
    model: 'PHY110',
    manufacturer: 'OPPO',
    brand: 'OPPO',
    screenWidth: '1440',
    screenHeight: '3168',
    osVersions: ['14', '15'],
    releaseYear: 2024,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: 'PGBM10',
    manufacturer: 'OPPO',
    brand: 'OPPO',
    screenWidth: '1240',
    screenHeight: '2772',
    osVersions: ['13', '14'],
    releaseYear: 2023,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: 'RMX3708',
    manufacturer: 'realme',
    brand: 'realme',
    screenWidth: '1240',
    screenHeight: '2772',
    osVersions: ['13', '14'],
    releaseYear: 2023,
    weight: 2,
    source: 'play-supported-devices',
  },

  // ========== HONOR / HUAWEI ==========
  {
    model: 'BVL-AN00',
    manufacturer: 'HONOR',
    brand: 'HONOR',
    screenWidth: '1264',
    screenHeight: '2800',
    osVersions: ['14', '15'],
    releaseYear: 2024,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: 'ELP-AN00',
    manufacturer: 'HONOR',
    brand: 'HONOR',
    screenWidth: '1224',
    screenHeight: '2700',
    osVersions: ['14', '15'],
    releaseYear: 2024,
    weight: 2,
    source: 'play-supported-devices',
  },
  {
    model: 'ALN-AL00',
    manufacturer: 'HUAWEI',
    brand: 'HUAWEI',
    screenWidth: '1260',
    screenHeight: '2720',
    osVersions: ['12', '13'],
    releaseYear: 2023,
    weight: 2,
    source: 'vendor-spec',
  },

  // ========== Sony / ZTE / Meizu / ASUS ==========
  {
    model: 'XQ-DQ72',
    manufacturer: 'Sony',
    brand: 'Sony',
    screenWidth: '1644',
    screenHeight: '3840',
    osVersions: ['13', '14'],
    releaseYear: 2023,
    weight: 1,
    source: 'play-supported-devices',
  },
  {
    model: 'NX769J',
    manufacturer: 'ZTE',
    brand: 'REDMAGIC',
    screenWidth: '1260',
    screenHeight: '2800',
    osVersions: ['14'],
    releaseYear: 2023,
    weight: 1,
    source: 'play-supported-devices',
  },
  {
    model: 'M816Q',
    manufacturer: 'MEIZU',
    brand: 'Meizu',
    screenWidth: '1080',
    screenHeight: '2208',
    osVersions: ['12'],
    releaseYear: 2019,
    weight: 1,
    source: 'capture',
  },
  {
    model: 'ASUS_AI2203_A',
    manufacturer: 'Game phone',
    brand: 'ASUS',
    screenWidth: '1080',
    screenHeight: '2208',
    osVersions: ['12'],
    releaseYear: 2022,
    weight: 1,
    source: 'capture',
  },
];

/** 加权抽取一台机型；权重非正的条目不会被抽到 */
export const pickDevicePreset = (
  random: () => number = Math.random,
  pool: readonly YishouDevicePreset[] = YISHOU_DEVICE_POOL
): YishouDevicePreset => {
  const total = pool.reduce((sum, preset) => sum + Math.max(0, preset.weight), 0);
  if (total <= 0) {
    return pool[0]!;
  }

  let ticket = random() * total;
  for (const preset of pool) {
    ticket -= Math.max(0, preset.weight);
    if (ticket < 0) return preset;
  }
  return pool[pool.length - 1]!;
};

/** 在机型支持的版本里随机取一个上报版本 */
export const pickOsVersion = (
  preset: YishouDevicePreset,
  random: () => number = Math.random
): string => {
  const versions = preset.osVersions;
  if (versions.length === 0) return '';
  const index = Math.min(versions.length - 1, Math.floor(random() * versions.length));
  return versions[index]!;
};
