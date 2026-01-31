// ==========================================
// 1. 类型定义 (Type Definitions)
// ==========================================

/** 输入的商品数据结构 */
export interface OrderItem {
  id: string | number;
  name: string;
  price: number; // 原始价格（元）
  required: boolean; // 是否必选
}

/** 内部计算用的商品结构（增加整数价格） */
interface ProcessedItem extends OrderItem {
  priceInt: number; // 价格（分），避免浮点误差
}

/** 单个订单结构 */
interface Order {
  items: OrderItem[];
  subtotal: number;
}

/** 输出的方案结构 */
export interface Solution {
  totalPrice: number;
  orders: Order[];
  unusedItems: OrderItem[];
}

/** 算法返回的最终结果 */
export interface CalculationResult {
  best: Solution | null;
  alternatives: Solution[];
}

/** 内部保存的原始解状态 */
interface RawSolution {
  totalInt: number;
  bins: number[]; // 每个订单当前的金额（分）
  allocation: number[]; // 索引映射: itemIndex -> orderIndex (-1代表未使用)
}

// ==========================================
// 2. 核心算法类 (Solver Class)
// ==========================================

export class OrderPoolingSolver {
  private items: ProcessedItem[];
  private targetInt: number;
  private orderCount: number;
  
  // 状态记录
  private minTotal: number = Infinity;
  private bestRawSolution: RawSolution | null = null;
  private validRawSolutions: RawSolution[] = [];
  private readonly MAX_ALTERNATIVES = 5; // 保留备选方案的最大数量

  constructor(items: OrderItem[], targetPrice: number, orderCount: number) {
    // 预处理：转为整数避免精度问题，并保留原始引用
    this.items = items.map((item, index) => ({
      ...item,
      // 如果没有ID则使用索引兜底
      id: item.id ?? index,
      priceInt: Math.round(item.price * 100),
    }));

    // 核心优化：按价格降序排序，优先处理大额商品以加速剪枝
    this.items.sort((a, b) => b.priceInt - a.priceInt);

    this.targetInt = Math.round(targetPrice * 100);
    this.orderCount = orderCount;
  }

  /**
   * 执行计算
   */
  public solve(): CalculationResult {
    // 初始化状态
    const initialBins = new Array(this.orderCount).fill(0);
    // allocation[i] = k 表示第i个商品放入第k个订单，-1表示未使用
    const allocation = new Array(this.items.length).fill(-1);

    this.dfs(0, initialBins, 0, allocation);

    return {
      best: this.formatOutput(this.bestRawSolution),
      alternatives: this.validRawSolutions
        // 排除掉和最优解完全一样的对象引用（逻辑上内容可能不同）
        .filter(sol => sol !== this.bestRawSolution)
        .sort((a, b) => a.totalInt - b.totalInt)
        .map(sol => this.formatOutput(sol) as Solution) // 过滤掉 null
    };
  }

  /**
   * 深度优先搜索 (Depth First Search)
   * @param idx 当前处理的商品索引
   * @param bins 当前各订单的累计金额（分）
   * @param currentTotalInt 当前所有已选商品的总金额（分）
   * @param allocation 商品分配状态数组
   */
  private dfs(
    idx: number,
    bins: number[],
    currentTotalInt: number,
    allocation: number[]
  ): void {
    // 1. 剪枝策略 (Pruning)
    // 如果当前金额已经超过了已知的最优解，且备选方案已满，则停止搜索
    // 注意：为了收集备选方案，这里不能只比较 >，而是允许一定的宽松度
    if (currentTotalInt >= this.minTotal && this.validRawSolutions.length >= this.MAX_ALTERNATIVES) {
        return;
    }

    // 2. 基准情况 (Base Case)：所有商品处理完毕
    if (idx === this.items.length) {
      // 检查是否所有订单都满足目标金额
      const allOrdersValid = bins.every(val => val >= this.targetInt);
      if (allOrdersValid) {
        this.recordSolution(currentTotalInt, bins, allocation);
      }
      return;
    }

    const item = this.items[idx];

    // 3. 递归分支 A：尝试将商品放入每一个订单
    for (let i = 0; i < this.orderCount; i++) {
      // 3.1 对称性剪枝 (Symmetry Breaking)
      // 如果当前订单金额与前一个订单相同，则放入当前订单与放入前一个等效。
      // 强制只放入前者，减少重复计算。
      if (i > 0 && bins[i] === bins[i - 1]) {
        continue;
      }

      // 状态更新
      bins[i] += item.priceInt;
      allocation[idx] = i;

      // 递归
      this.dfs(idx + 1, bins, currentTotalInt + item.priceInt, allocation);

      // 回溯 (Backtrack)
      bins[i] -= item.priceInt;
      allocation[idx] = -1;
    }

    // 4. 递归分支 B：尝试“不使用”该商品
    // 只有“非必选”商品可以跳过
    if (!item.required) {
      this.dfs(idx + 1, bins, currentTotalInt, allocation);
    }
  }

  /**
   * 记录有效的解决方案
   */
  private recordSolution(totalInt: number, bins: number[], allocation: number[]): void {
    const newSolution: RawSolution = {
      totalInt,
      bins: [...bins], // 浅拷贝数组
      allocation: [...allocation]
    };

    if (totalInt < this.minTotal) {
      // 发现新的全局最优解
      this.minTotal = totalInt;
      this.bestRawSolution = newSolution;
      // 重置备选方案，只保留当前这个最优的（因为它比旧的都要好）
      this.validRawSolutions = [newSolution];
    } else if (totalInt === this.minTotal) {
      // 发现同价的最优解，加入备选
      this.validRawSolutions.push(newSolution);
    } else {
      // 发现非最优但合法的解（用于备选）
      if (this.validRawSolutions.length < this.MAX_ALTERNATIVES) {
        this.validRawSolutions.push(newSolution);
      }
    }
  }

  /**
   * 将内部整数状态转换为输出格式
   */
  private formatOutput(raw: RawSolution | null): Solution | null {
    if (!raw) return null;

    const orders: Order[] = Array.from({ length: this.orderCount }, () => ({
      items: [],
      subtotal: 0
    }));
    const unusedItems: OrderItem[] = [];

    // 根据 allocation 还原分配情况
    raw.allocation.forEach((orderIndex, itemIndex) => {
      // 注意：这里使用的是 this.items (已经排序过的)，必须按索引对应
      // itemIndex 对应的是 this.items 中的顺序
      const item = this.items[itemIndex];
      
      // 还原为原始 OrderItem 结构 (去掉 priceInt)
      const outputItem: OrderItem = {
          id: item.id,
          name: item.name,
          price: item.price,
          required: item.required
      };

      if (orderIndex !== -1) {
        orders[orderIndex].items.push(outputItem);
        orders[orderIndex].subtotal += item.price; // 累加原始浮点价格
      } else {
        unusedItems.push(outputItem);
      }
    });

    // 处理浮点数显示精度
    orders.forEach(o => {
      o.subtotal = Number(o.subtotal.toFixed(2));
    });

    return {
      totalPrice: raw.totalInt / 100,
      orders,
      unusedItems
    };
  }
}
