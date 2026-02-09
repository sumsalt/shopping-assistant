"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// pages/calculator/index.ts
const OrderPoolingSolver_1 = require("../../OrderPoolingSolver");
Page({
    data: {
        bulkInput: '',
        items: [
            { name: '', price: '', required: false },
            { name: '', price: '', required: false },
            { name: '', price: '', required: false }
        ],
        targetPrice: '',
        targetQuantity: '1',
        result: null,
        hasCalculated: false,
        validItemCount: 0,
        totalPrice: '0.00',
        meetsRequirements: false,
        priceDiff: 0,
        quantityDiff: 0,
        priceDiffAbs: 0,
        quantityDiffAbs: 0,
        priceDiffText: '相差',
        quantityDiffText: '相差'
    },
    // 分享功能
    onShareAppMessage() {
        return {
            title: '凑单计算器 - 智能计算最优凑单方案',
            path: '/pages/calculator/index',
            imageUrl: ''
        };
    },
    onShareTimeline() {
        return {
            title: '凑单计算器 - 智能计算最优凑单方案',
            query: '',
            imageUrl: ''
        };
    },
    // 批量输入变化
    onBulkInputChange(e) {
        const value = e.detail.value;
        this.setData({
            bulkInput: value
        });
        // 处理批量输入
        const input = value.trim();
        if (!input) {
            return;
        }
        const parsedItems = this.parseJielongInput(input);
        if (parsedItems.length > 0) {
            const newItems = parsedItems.map(item => ({
                name: item.name || '',
                price: item.price.toString(),
                required: false
            }));
            this.setData({ items: newItems });
            this.updateStats();
            wx.showToast({
                title: `已添加 ${parsedItems.length} 个商品`,
                icon: 'success'
            });
        }
    },
    /**
     * 解析接龙输入格式
     * 支持多种格式：
     * 1. 编号行：如 "1. 张三 123.45"
     * 2. 名称价格行：如 "张三 123.45" 或 "张三 123.45 运费6开"
     * 3. 纯数字格式：逗号或空格分隔的数字，如 "59.9,88,129.5"
     * 4. 混合格式：名称中包含特殊字符或价格后有注释
     */
    parseJielongInput(input) {
        const result = [];
        // 按行分割，处理多行接龙
        const lines = input.split(/\n/).filter(line => line.trim());
        for (const line of lines) {
            const trimmedLine = line.trim();
            // 跳过空行和标题行
            if (!trimmedLine ||
                trimmedLine.startsWith('#') ||
                trimmedLine.startsWith('例') ||
                trimmedLine.includes('接龙标题') ||
                trimmedLine.includes('接龙描述') ||
                trimmedLine.includes('接龙例子')) {
                continue;
            }
            // 尝试从行中提取价格（找到第一个数字）
            // 匹配：整数或小数（如 245, 191.76, 307.56）
            const priceMatch = trimmedLine.match(/(\d+\.?\d*)/);
            if (priceMatch) {
                const price = parseFloat(priceMatch[1]);
                if (!isNaN(price) && price > 0) {
                    // 提取价格前的所有内容作为名称
                    const priceIndex = trimmedLine.indexOf(priceMatch[0]);
                    let name = trimmedLine.substring(0, priceIndex).trim();
                    // 如果有编号，移除编号
                    const numberedPrefixMatch = name.match(/^\d+[\.、]\s*/);
                    if (numberedPrefixMatch) {
                        name = name.substring(numberedPrefixMatch[0].length).trim();
                    }
                    result.push({ name, price });
                    continue;
                }
            }
        }
        return result;
    },
    // 商品名称变化
    onItemNameChange(e) {
        const index = Number(e.currentTarget.dataset.index);
        const value = e.detail.value;
        const items = [...this.data.items];
        items[index].name = value;
        this.setData({ items });
    },
    // 商品价格变化
    onItemPriceChange(e) {
        const index = Number(e.currentTarget.dataset.index);
        const value = e.detail.value;
        const items = [...this.data.items];
        items[index].price = value;
        this.setData({ items });
        this.updateStats();
    },
    // 切换必选状态
    toggleRequired(e) {
        const index = Number(e.currentTarget.dataset.index);
        this.data.items[index].required = !this.data.items[index].required;
        this.setData({
            items: this.data.items
        });
    },
    // 凑单价格变化
    onTargetPriceChange(e) {
        this.setData({
            targetPrice: e.detail.value
        });
        this.updateStats();
    },
    // 凑单数量变化
    onTargetQuantityChange(e) {
        this.setData({
            targetQuantity: e.detail.value
        });
        this.updateStats();
    },
    // 添加商品
    addItem() {
        const items = [...this.data.items, { name: '', price: '', required: false }];
        this.setData({ items });
    },
    // 移除商品
    removeItem(e) {
        const index = Number(e.currentTarget.dataset.index);
        if (this.data.items.length > 1) {
            const items = this.data.items.filter((_, i) => i !== index);
            this.setData({ items });
            this.updateStats();
        }
    },
    // 更新统计信息
    updateStats() {
        const validItems = this.data.items.filter(item => {
            const price = parseFloat(item.price);
            return !isNaN(price) && price > 0;
        });
        const validItemCount = validItems.length;
        const totalPrice = validItems.reduce((sum, item) => sum + parseFloat(item.price), 0);
        const target = parseFloat(this.data.targetPrice);
        const qty = parseInt(this.data.targetQuantity) || 1;
        const meetsRequirements = target > 0 && totalPrice >= target * qty && validItemCount >= qty;
        const priceDiff = target > 0 ? totalPrice - target * qty : 0;
        const quantityDiff = validItemCount - qty;
        const priceDiffAbs = Math.abs(priceDiff);
        const quantityDiffAbs = Math.abs(quantityDiff);
        const priceDiffText = priceDiff >= 0 ? '超出' : '相差';
        const quantityDiffText = quantityDiff >= 0 ? '超出' : '相差';
        this.setData({
            validItemCount,
            totalPrice: totalPrice.toFixed(2),
            meetsRequirements,
            priceDiff,
            quantityDiff,
            priceDiffAbs,
            quantityDiffAbs,
            priceDiffText,
            quantityDiffText
        });
    },
    // 计算凑单方案
    calculate() {
        // 获取有效的商品价格
        const validItems = this.data.items
            .map((item, index) => ({
            id: index,
            name: item.name || `商品 ${index + 1}`,
            price: parseFloat(item.price),
            required: item.required
        }))
            .filter(item => !isNaN(item.price) && item.price > 0);
        if (validItems.length === 0) {
            wx.showToast({
                title: '请至少输入一个有效的商品价格',
                icon: 'none'
            });
            return;
        }
        const target = parseFloat(this.data.targetPrice);
        if (isNaN(target) || target <= 0) {
            wx.showToast({
                title: '请输入有效的凑单价格',
                icon: 'none'
            });
            return;
        }
        const targetQty = parseInt(this.data.targetQuantity) || 1;
        // 检查是否有足够的商品总价值
        const totalValue = validItems.reduce((sum, item) => sum + item.price, 0);
        const minValueNeeded = target * targetQty;
        if (totalValue < minValueNeeded) {
            wx.showToast({
                title: `商品总价 ¥${totalValue.toFixed(2)} 不足以凑满 ${targetQty} 个订单`,
                icon: 'none',
                duration: 3000
            });
            this.setData({
                result: null,
                hasCalculated: true
            });
            return;
        }
        wx.showLoading({
            title: '计算中...'
        });
        setTimeout(() => {
            try {
                // 使用算法类计算
                const solver = new OrderPoolingSolver_1.OrderPoolingSolver(validItems, target, targetQty);
                const calculationResult = solver.solve();
                if (!calculationResult.best) {
                    const requiredItems = validItems.filter(item => item.required);
                    const requiredTotal = requiredItems.reduce((sum, item) => sum + item.price, 0);
                    if (requiredItems.length > 0) {
                        wx.showToast({
                            title: `无法凑单：必选商品 ${requiredItems.length} 件`,
                            icon: 'none',
                            duration: 3000
                        });
                    }
                    else {
                        wx.showToast({
                            title: '无法凑单，请检查商品组合',
                            icon: 'none'
                        });
                    }
                    this.setData({
                        result: null,
                        hasCalculated: true
                    });
                    wx.hideLoading();
                    return;
                }
                // 转换结果格式
                const bestSolution = calculationResult.best;
                const allSolutions = [bestSolution, ...calculationResult.alternatives];
                // 计算超出目标的价格
                const targetTotal = target * targetQty;
                const priceDiff = (bestSolution.totalPrice - targetTotal).toFixed(2);
                // 计算超出目标的数量
                const selectedItemCount = bestSolution.orders.flatMap(order => order.items).length;
                const quantityDiff = selectedItemCount - bestSolution.orders.length;
                // 提取其他方案（排除最优解，最多显示 5 个）
                const otherSolutions = allSolutions
                    .slice(1, 6)
                    .map(sol => ({
                    items: sol.orders.flatMap(order => order.items),
                    orders: sol.orders.map(order => ({
                        items: order.items,
                        total: order.subtotal.toFixed(2)
                    })),
                    totalPrice: sol.totalPrice.toFixed(2),
                    orderCount: sol.orders.length,
                    priceDiff: (sol.totalPrice - target * sol.orders.length).toFixed(2)
                }));
                const result = {
                    selectedItems: bestSolution.orders.flatMap(order => order.items),
                    totalPrice: bestSolution.totalPrice.toFixed(2),
                    orderCount: bestSolution.orders.length,
                    orders: bestSolution.orders.map(order => ({
                        items: order.items,
                        total: order.subtotal.toFixed(2)
                    })),
                    unusedItems: bestSolution.unusedItems.length,
                    priceDiff,
                    quantityDiff,
                    otherSolutions
                };
                this.setData({
                    result,
                    hasCalculated: true
                });
                wx.showToast({
                    title: `找到 ${allSolutions.length} 种凑单方案`,
                    icon: 'success'
                });
            }
            catch (error) {
                console.error('计算失败:', error);
                wx.showToast({
                    title: '计算失败，请重试',
                    icon: 'none'
                });
            }
            wx.hideLoading();
        }, 100);
    }
});
