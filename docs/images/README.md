# 截图目录

README 顶部使用**两张图**（封面图 + 网页截图），放在本目录：

| 文件名 | 内容 |
| --- | --- |
| `cover.png` | 项目封面图（横幅，建议宽 ≥1380px） |
| `screenshot.png` | 网页界面截图（演示模式下的主界面） |

`README.md` 顶部已按此路径写好 `<img src="docs/images/cover.png">` 与
`<img src="docs/images/screenshot.png">`，把两张图放进本目录即可显示；
若改用上传到 GitHub 的图片地址，把 `src` 换成对应地址即可。

截取网页截图的步骤：

```bash
bash scripts/start-demo.sh
# 打开 http://127.0.0.1:8787，截取主界面后保存为 docs/images/screenshot.png
```

注意事项：

- 截图请用**演示模式**，避免泄露真实订单、手机号、地址或支付链接；
- 截图内不要出现 Token 或 `apps/server/.env` 的内容；
- 不要放"在线演示"按钮或指向不可访问地址的链接。
