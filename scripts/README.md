# 脚本

| 脚本 | 作用 |
| --- | --- |
| `start-demo.sh` | 以演示模式启动（不需要 Token），自动构建前端后打开本地地址 |
| `start-real.sh` | 以真实模式启动；启动前校验 `apps/server/.env` 是否已配置 Token |
| `check.sh` | 本地自检：依赖 → 类型检查 → 离线测试 → 构建 → 演示模式冒烟 |
| `prepublish-check.sh` | 发布前校验：Token 是否泄漏到产物、声明文件是否被改动、示例配置是否含凭据、链接是否存在 |
| `delete-local-data.sh` | 删除本机全部本地数据（SQLite 数据库及其 WAL/SHM 文件） |
| `warm-product-images.sh` | 在营业时间预热商品图片**地址**缓存（只存 https 地址，不下载图片文件） |

所有脚本只在本地运行，**不会调用真实下单接口，不会上传任何数据**。
