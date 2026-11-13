/**
 * 一手 App 深链构造（Web 侧入口）。
 *
 * 实现已统一到 core：`src/yishou-deeplink.ts`。这里只做转发，
 * 保证 Web（页面唤起 App）与服务端（邮件拼链接）用的是同一份实现，避免两端漂移。
 * 之所以 core 不反向 import web：`src` 被独立的 `tsc`（rootDir=./src）编译，
 * 不能引用 web 下的文件；而 web 通过 `@core` 别名引用 core 是标准做法。
 */
export * from '@core/yishou-deeplink'
