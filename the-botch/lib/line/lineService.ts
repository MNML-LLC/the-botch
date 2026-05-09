import { messagingApi } from '@line/bot-sdk'

export const lineClient = new messagingApi.MessagingApiClient({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
})

export async function sendIndividualMessage(userId: string, message: string) {
  await lineClient.pushMessage({
    to: userId,
    messages: [{ type: 'text', text: message }],
  })
}
