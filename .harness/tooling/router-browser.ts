/** 固定浏览器路由环境，避免 Plasmo 的 Node 条件回退错误启用 SSR。 */
export const isServer = false
/** 浏览器构建不加载服务端路由，与 Router 浏览器入口合同保持一致。 */
export const loadServerRoute = undefined
