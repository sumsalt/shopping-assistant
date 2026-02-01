declare const App: any
declare const Page: any
declare const wx: any
declare const console: any
declare const setTimeout: any

declare namespace WechatMiniprogram {
  namespace App {
    interface LaunchShowOption {
      onLaunch?: () => void
      onShow?: () => void
    }
  }

  namespace Page {
    interface CustomOption {}
  }

  interface Input {
    detail: {
      value: string
    }
  }

  interface CustomEvent {
    detail: string | any
    currentTarget: {
      dataset: {
        [key: string]: any
      }
    }
  }
}
