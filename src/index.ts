import crypto from "node:crypto"
import * as core from "@actions/core"
import axios from "axios"

const ACTION_PACKAGE = "https://github.com/leafney/dingtalk-action"
const DINGTALK_URL = "https://oapi.dingtalk.com/robot/send"

const VALID_MSGTYPES = ["text", "link", "markdown", "actionCard", "feedCard"] as const
type MsgType = (typeof VALID_MSGTYPES)[number]

type BtnItem = {
  title: string
  actionURL: string
}

type FeedItem = {
  title: string
  messageURL: string
  picURL: string
}

type DingTalkPayload = {
  msgtype: MsgType
  text?: { content: string }
  at?: { atMobiles?: string[]; isAtAll?: boolean }
  link?: { title: string; text: string; messageUrl: string; picUrl: string }
  markdown?: { title: string; text: string }
  actionCard?: {
    title: string
    text: string
    btnOrientation: string
    singleTitle?: string
    singleURL?: string
    btns?: BtnItem[]
  }
  feedCard?: { links: FeedItem[] }
}

// most @actions toolkit packages have async methods
async function run() {
  try {
    const accessToken = process.env.DINGTALK_ACCESS_TOKEN || ""
    const secret = process.env.DINGTALK_SECRET || ""

    const jobStatus = core.getInput("status")
    const msgtype = core.getInput("msgtype")

    if (accessToken === "") throw new Error("The environment variable parameter [DINGTALK_ACCESS_TOKEN] is required")
    if (jobStatus === "") throw new Error("The input parameter [status] is empty")
    if (!(VALID_MSGTYPES as readonly string[]).includes(msgtype))
      throw new Error(`msgtype should be one of ${VALID_MSGTYPES.join(",")}`)

    let notifyWhen = core.getInput("notify_when")
    const title = core.getInput("title")
    const text = core.getInput("text")

    // msgtype of text and markdown
    const atMobiles = core.getInput("at_mobiles")
    const atAll = (core.getInput("at_all") || "false").toUpperCase() === "TRUE"

    const payload: DingTalkPayload = { msgtype: msgtype as MsgType }
    switch (msgtype) {
      case "text": {
        payload.text = { content: text }
        const at: { atMobiles?: string[]; isAtAll?: boolean } = {}
        if (atMobiles) {
          at.atMobiles = atMobiles.split(",")
          at.isAtAll = atAll
        } else if (atAll) {
          at.isAtAll = atAll
        }
        payload.at = at
        break
      }
      case "link": {
        // msgtype of link
        const msgUrl = core.getInput("msg_url") || ACTION_PACKAGE
        const picUrl = core.getInput("pic_url")
        payload.link = { title, text, messageUrl: msgUrl, picUrl }
        break
      }
      case "markdown": {
        payload.markdown = { title, text }
        const at: { atMobiles?: string[]; isAtAll?: boolean } = {}
        if (atMobiles) {
          at.atMobiles = atMobiles.split(",")
          at.isAtAll = atAll
        } else if (atAll) {
          at.isAtAll = atAll
        }
        payload.at = at
        break
      }
      case "actionCard": {
        // msgtype of actionCard
        let singleTitle = core.getInput("single_title")
        let singleUrl = core.getInput("single_url")
        const btns = core.getInput("btns") || "[]"
        const btnOrientation = core.getInput("btn_orientation") || "0"

        const isOverAll = singleTitle !== "" || singleUrl !== ""
        singleTitle = singleTitle || "Read More"
        singleUrl = singleUrl || ACTION_PACKAGE

        const btnsObj = JSON.parse(btns) as BtnItem[]
        if (!isOverAll) {
          // btns must exist `title` and `actionURL`
          const btnsRes = btnsObj.every(item => "title" in item && "actionURL" in item)
          if (!btnsRes) throw new Error("btns list object should be exist [title] and [actionURL]")
        }

        const actionCard: DingTalkPayload["actionCard"] = {
          title,
          text,
          btnOrientation,
        }
        if (isOverAll) {
          actionCard.singleTitle = singleTitle
          actionCard.singleURL = singleUrl
        } else {
          actionCard.btns = btnsObj
        }
        payload.actionCard = actionCard
        break
      }
      case "feedCard": {
        // msgtype of feedCard
        const feedLinks = core.getInput("feed_links") || "[]"
        const feedObj = JSON.parse(feedLinks) as FeedItem[]

        const feedRes = feedObj.every(item => "title" in item && "messageURL" in item && "picURL" in item)
        if (!feedRes) throw new Error("feed_links list object should be exist [title] [messageURL] and [picURL]")

        payload.feedCard = { links: feedObj }
        break
      }
      default:
        break
    }

    // core.info(`the payload context: ${JSON.stringify(payload)}`);

    const url = new URL(`?access_token=${accessToken}`, DINGTALK_URL)

    // sign the request if given
    if (secret) {
      const timestamp = Date.now()
      const stringToSign = `${timestamp}\n${secret}`
      const sign = crypto.createHmac("sha256", secret).update(stringToSign).digest("base64")
      url.searchParams.append("timestamp", timestamp.toString())
      url.searchParams.append("sign", sign)
    }

    // check status
    if (notifyWhen === "") {
      notifyWhen = "success,failure,cancelled"
    }
    const notifyWhenArr = notifyWhen.split(",")

    if (notifyWhenArr.includes(jobStatus)) {
      // send notify
      const ret = await axios.post(url.toString(), JSON.stringify(payload), {
        headers: {
          "Content-Type": "application/json",
        },
        proxy: false,
      })

      if (ret.data.errcode) {
        throw new Error(`钉钉机器人返回错误: [${ret.data.errcode}] ${ret.data.errmsg}`)
      } else {
        core.info(`钉钉机器人发送成功`)
      }
    } else {
      core.info(`Dingtalk Robot Notify Skipped Status: [${jobStatus}]`)
    }
  } catch (err) {
    core.error(`dingtalk exception: ${err instanceof Error ? err.message : String(err)}`)
    core.setFailed(err instanceof Error ? err.message : String(err))
  }
}

await run()
