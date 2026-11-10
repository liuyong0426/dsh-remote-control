/** Browser Loader never reaches its Node-side resolver, so these stubs are unreachable. */
const unreachable = (name: string) => (): never => { throw new Error(`远程浏览器不支持本机 Node 模块：${name}`) }

export default {
  fileURLToPath: unreachable('url.fileURLToPath'),
  pathToFileURL: unreachable('url.pathToFileURL'),
} as Record<string, unknown>
