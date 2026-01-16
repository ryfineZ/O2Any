import { TFile } from 'obsidian';

/**
 * Define the data types for wechat api
 * @author: Learner Chen
 */

// 通用出错 返回
// {"errcode":40013,"errmsg":"invalid appid"}
export type ErrorResponse = {
    errorcode: number,
    errmsg: string
}

// 获取 Access token 返回值
export type AccessTokenResponse = {
    access_token: string;
    expires_in: number;
}

// --------------------------------------- 素材管理 -----------------------------------------------

//素材的类型
export type MediaType = 'image' | 'voice' | 'video' | 'thumb' | 'news' | 'draft'


// 请求参数
export type MaterialRequestParams = {
    type: string;
    offset: number;
    count: number;
}
// 永久图文消息内容项 (News)
// json.item[x].content.news_item[x]
export type NewsItem = {
    title: string;
    thumb_media_id: string;
    show_cover_pic: number;
    author: string;
    digest: string;
    content: string;
    url: string;
    content_source_url: string;
    // need_open_comment:number;
    // only_fans_can_comment:number;
}

// 永久图文消息项
// json.item[x]
export type MaterialNewsItem = {
    _id?:string;
    _rev?:string
    accountName?: string;
    type?:MediaType;
    media_id: string;
    content: {
        news_item: Array<NewsItem>
    },
    update_time: number;//UPDATE_TIME
}

// 图文素材之外,其他类型（图片、语音、视频）： （other media items other than news items）
// json.item[x]
export type MaterialMeidaItem = {
    _id?:string;
    _rev?:string;
    accountName?: string;
    type?:MediaType;
    media_id: string;
    name: string;
    update_time: number;
    url: string;
    used: boolean;
    notePath?: TFile; // 修改为TFile类型
}

// common

export type MaterialItem = MaterialNewsItem | MaterialMeidaItem | DraftItem

//json
export type MaterialResponse = {
    total_count: number;
    item_count: number;
    item: Array<MaterialItem>;
}

// --------------------------------------- 草稿箱管理 ---------------------------------------

// for new/modify articles 
export type DraftArticle = {
    title: string;
    author?: string;
    digest?: string;
    content: string;
    content_source_url?: string;
    thumb_media_id: string;
    need_open_comment?: number;
    only_fans_can_comment?: number;
    pic_crop_235_1?: string; //X1_Y1_X2_Y2, 用分隔符_拼接为X1_Y1_X2_Y2
    pic_crop_1_1?: string; //X1_Y1_X2_Y2, 用分隔符_拼接为X1_Y1_X2_Y2
}

// for get draft news.
export type DraftNewsItem = {
    title: string;
    author?: string;
    digest?: string;
    content: string;
    content_source_url?: string;
    thumb_media_id: string;
    show_cover_pic: number; //	是否在正文显示封面。平台已不支持此功能，因此默认为0，即不展示
    need_open_comment?: number;
    only_fans_can_comment?: number;
    url: string; //	草稿的临时链接
}

// for get draft list in batch
export type DraftItem = {
    _id?:string;
    _rev?:string;
    accountName?: string;
    type?:MediaType;
    media_id: string;
    content: {
        news_item: Array<DraftNewsItem>;
    }
    update_time: number;
}

export type DraftListResponse = {
    total_count: number;
    item_count: number;
    item: Array<DraftItem>;
}
