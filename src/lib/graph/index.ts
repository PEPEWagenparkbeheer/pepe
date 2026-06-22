export { readAzureConfig, getAccessToken } from './auth'
export type { AzureConfig, TokenResult } from './auth'

export { getRecentMessages, getSentMessages, getMessage, replyToMessage, sendMail, getMessageConversationId } from './mail'
export type { GraphMessage, MailBijlage } from './mail'
