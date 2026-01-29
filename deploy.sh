#!/bin/bash

# ===========================================
# Shopping Assistant 部署脚本
# ===========================================

set -e  # 遇到错误时退出

# ============= 配置变量（请根据实际情况修改） =============
VPS_USER="ubuntu"                              # VPS 用户名
VPS_HOST="118.24.34.177"                       # VPS IP 地址或域名
VPS_PORT="22"                                # SSH 端口
REMOTE_PATH="/var/www/shopping-assistant"   # 远程部署路径
APP_NAME="shopping-assistant"                # PM2 应用名称

# ============= 获取脚本所在目录（绝对路径） =============
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WEB_DIR="${SCRIPT_DIR}/web"

# ============= 颜色定义 =============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ============= 辅助函数 =============
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# ============= 检查配置 =============
check_config() {
    if [ "$VPS_HOST" = "your-vps-ip" ]; then
        log_error "请先配置 VPS_HOST 变量！"
        echo "  编辑此脚本，将 VPS_HOST 设置为你的 VPS IP 地址或域名"
        exit 1
    fi
}

# ============= 构建项目 =============
build() {
    log_info "开始构建项目..."
    log_info "Web 目录: ${WEB_DIR}"
    
    # 检查 web 目录是否存在
    if [ ! -d "${WEB_DIR}" ]; then
        log_error "Web 目录不存在: ${WEB_DIR}"
        exit 1
    fi
    
    # 进入 web 目录
    cd "${WEB_DIR}"
    
    # 安装依赖（如果需要）
    if [ ! -d "node_modules" ] || [ "$1" = "--install" ]; then
        log_info "安装依赖..."
        npm install
    fi
    
    # 构建
    npm run build
    
    log_success "构建完成！"
}

# ============= 上传文件 =============
upload() {
    log_info "上传文件到 VPS..."
    log_info "Web 目录: ${WEB_DIR}"
    log_info "目标服务器: ${VPS_USER}@${VPS_HOST}:${VPS_PORT}"
    log_info "远程路径: ${REMOTE_PATH}"
    
    # 检查 web 目录是否存在
    if [ ! -d "${WEB_DIR}" ]; then
        log_error "Web 目录不存在: ${WEB_DIR}"
        exit 1
    fi
    
    cd "${WEB_DIR}"
    
    # 检查 .output 目录是否存在
    if [ ! -d ".output" ]; then
        log_error ".output 目录不存在，请先运行构建！"
        exit 1
    fi
    
    # 显示将要上传的文件大小
    OUTPUT_SIZE=$(du -sh .output | cut -f1)
    log_info "将上传 .output 目录 (大小: ${OUTPUT_SIZE})"
    
    # 创建远程目录（如果不存在）- 使用 sudo 创建
    log_info "创建远程目录..."
    ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_HOST}" "sudo mkdir -p ${REMOTE_PATH} && sudo chown ${VPS_USER}:${VPS_USER} ${REMOTE_PATH}"
    
    # 使用 rsync 同步文件
    log_info "开始同步文件..."
    rsync -avz --delete --progress \
        -e "ssh -p ${VPS_PORT}" \
        .output/ \
        "${VPS_USER}@${VPS_HOST}:${REMOTE_PATH}/.output/"
    
    log_success "文件上传完成！"
    log_info "远程路径: ${REMOTE_PATH}/.output/"
}

# ============= 重启服务 =============
restart() {
    log_info "重启远程服务..."
    
    ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_HOST}" << EOF
        cd ${REMOTE_PATH}
        
        # 检查 PM2 是否安装
        if ! command -v pm2 &> /dev/null; then
            echo "PM2 未安装，正在安装..."
            npm install -g pm2
        fi
        
        # 检查应用是否已存在
        if pm2 list | grep -q "${APP_NAME}"; then
            # 重启应用
            pm2 restart ${APP_NAME}
        else
            # 首次启动应用
            pm2 start .output/server/index.mjs --name ${APP_NAME}
            pm2 save
        fi
        
        # 显示状态
        pm2 status
EOF
    
    log_success "服务重启完成！"
}

# ============= 查看日志 =============
logs() {
    log_info "查看远程日志..."
    ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_HOST}" "pm2 logs ${APP_NAME} --lines 50"
}

# ============= 查看状态 =============
status() {
    log_info "查看服务状态..."
    ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_HOST}" "pm2 status"
}

# ============= 停止服务 =============
stop() {
    log_info "停止远程服务..."
    ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_HOST}" "pm2 stop ${APP_NAME}"
    log_success "服务已停止！"
}

# ============= 初始化 VPS 环境 =============
init() {
    log_info "初始化 VPS 环境..."
    
    ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_HOST}" << 'EOF'
        # 更新包管理器
        sudo apt update
        
        # 安装 Node.js (如果没有)
        if ! command -v node &> /dev/null; then
            echo "安装 Node.js..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
            sudo apt-get install -y nodejs
        fi
        
        # 安装 PM2
        if ! command -v pm2 &> /dev/null; then
            echo "安装 PM2..."
            sudo npm install -g pm2
        fi
        
        # 安装 Nginx
        if ! command -v nginx &> /dev/null; then
            echo "安装 Nginx..."
            sudo apt install -y nginx
        fi
        
        # 显示版本信息
        echo ""
        echo "============= 环境信息 ============="
        echo "Node.js: $(node -v)"
        echo "NPM: $(npm -v)"
        echo "PM2: $(pm2 -v)"
        echo "Nginx: $(nginx -v 2>&1)"
        echo "==================================="
EOF
    
    log_success "VPS 环境初始化完成！"
}

# ============= 配置 Nginx =============
setup_nginx() {
    if [ -z "$1" ]; then
        log_error "请提供域名参数！"
        echo "  用法: $0 nginx your-domain.com"
        exit 1
    fi
    
    DOMAIN=$1
    log_info "配置 Nginx (域名: ${DOMAIN})..."
    
    # 生成 Nginx 配置
    NGINX_CONFIG="server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}"
    
    ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_HOST}" << EOF
        # 写入 Nginx 配置
        echo '${NGINX_CONFIG}' | sudo tee /etc/nginx/sites-available/${APP_NAME} > /dev/null
        
        # 启用站点
        sudo ln -sf /etc/nginx/sites-available/${APP_NAME} /etc/nginx/sites-enabled/
        
        # 测试配置
        sudo nginx -t
        
        # 重载 Nginx
        sudo systemctl reload nginx
EOF
    
    log_success "Nginx 配置完成！"
    log_info "下一步：运行 '$0 ssl ${DOMAIN}' 配置 HTTPS"
}

# ============= 配置 SSL 证书 =============
setup_ssl() {
    if [ -z "$1" ]; then
        log_error "请提供域名参数！"
        echo "  用法: $0 ssl your-domain.com"
        exit 1
    fi
    
    DOMAIN=$1
    log_info "配置 SSL 证书 (域名: ${DOMAIN})..."
    
    ssh -p "$VPS_PORT" "${VPS_USER}@${VPS_HOST}" << EOF
        # 安装 Certbot
        if ! command -v certbot &> /dev/null; then
            echo "安装 Certbot..."
            sudo apt install -y certbot python3-certbot-nginx
        fi
        
        # 检查证书是否已存在
        if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
            echo "证书已存在，检查是否需要续期..."
            sudo certbot renew --nginx --non-interactive --quiet
        else
            echo "申请新证书..."
            sudo certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos --register-unsafely-without-email --redirect
        fi
        
        # 确保自动续期定时任务已配置
        echo "配置自动续期定时任务..."
        if ! sudo crontab -l 2>/dev/null | grep -q "certbot renew"; then
            (sudo crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --post-hook 'systemctl reload nginx'") | sudo crontab -
            echo "已添加自动续期定时任务（每天凌晨3点检查）"
        else
            echo "自动续期定时任务已存在"
        fi
        
        echo ""
        echo "证书状态："
        sudo certbot certificates
EOF
    
    log_success "SSL 证书配置完成！"
    echo ""
    log_info "你的网站现在可以通过 https://${DOMAIN} 访问了"
}

# ============= 完整部署流程 =============
deploy() {
    log_info "开始完整部署流程..."
    echo ""
    
    check_config
    build
    upload
    restart
    
    echo ""
    log_success "🎉 部署完成！"
}

# ============= 显示帮助 =============
show_help() {
    echo "Shopping Assistant 部署脚本"
    echo ""
    echo "用法: $0 <命令> [参数]"
    echo ""
    echo "命令:"
    echo "  deploy      完整部署流程（构建 + 上传 + 重启）"
    echo "  build       仅构建项目"
    echo "  upload      仅上传文件到 VPS"
    echo "  restart     重启远程服务"
    echo "  stop        停止远程服务"
    echo "  status      查看服务状态"
    echo "  logs        查看远程日志"
    echo "  init        初始化 VPS 环境（安装 Node.js、PM2、Nginx）"
    echo "  nginx       配置 Nginx（需要域名参数）"
    echo "  ssl         配置 SSL 证书（需要域名参数）"
    echo "  help        显示帮助信息"
    echo ""
    echo "示例:"
    echo "  $0 deploy                   # 完整部署"
    echo "  $0 build                    # 仅构建"
    echo "  $0 nginx example.com        # 配置 Nginx"
    echo "  $0 ssl example.com          # 配置 HTTPS"
    echo ""
    echo "首次部署步骤:"
    echo "  1. 编辑此脚本，配置 VPS_USER、VPS_HOST 等变量"
    echo "  2. 运行 '$0 init' 初始化 VPS 环境"
    echo "  3. 运行 '$0 deploy' 部署应用"
    echo "  4. 运行 '$0 nginx your-domain.com' 配置 Nginx"
    echo "  5. 运行 '$0 ssl your-domain.com' 配置 HTTPS"
}

# ============= 主入口 =============
case "${1:-help}" in
    deploy)
        deploy
        ;;
    build)
        build "$2"
        ;;
    upload)
        check_config
        upload
        ;;
    restart)
        check_config
        restart
        ;;
    stop)
        check_config
        stop
        ;;
    status)
        check_config
        status
        ;;
    logs)
        check_config
        logs
        ;;
    init)
        check_config
        init
        ;;
    nginx)
        check_config
        setup_nginx "$2"
        ;;
    ssl)
        check_config
        setup_ssl "$2"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "未知命令: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
