/**
 * manage wechat thumbnail media 
 */
export class SrcThumbList {
    list: Map<string, string[]>;

    constructor() {
        this.list = new Map()
    }

    public add(thumb_media_id: string, news_url:string | string []) {
        if (this.list.has(thumb_media_id)) {
            if (typeof news_url === 'string'){
                this.list.get(thumb_media_id)?.push(news_url)
            }else{
                this.list.get(thumb_media_id)?.push(...news_url)
            }
        } else {
            if (typeof news_url === 'string'){
                this.list.set(thumb_media_id, [news_url])
            }else{
                this.list.set(thumb_media_id, news_url)
            }
        }
    }
    public clear(){
        this.list.clear()
    }
    public get(key:string) : string[]|undefined {
        return this.list.get(key)
    }
    
}
