/** 内部消息总线：模块间解耦通信 */
export type MSG_TYPE  = 
  'src-thumb-list-updated' | 
  'material-updated' | 
  'wechat-account-changed' |
  'selected-theme-changed' |
  'draft-title-updated' |
  'active-file-changed' |
  'wechat-material-updated' |
  'clear-draft-list' |
  'clear-news-list' |
  'clear-image-list' |
  'clear-video-list' |
  'clear-voice-list' |
  'clear-thumb-list' |
  'draft-item-updated' |
  'draft-item-deleted' |
  'news-item-updated' |
  'news-item-deleted' |
  'image-item-updated' |
  'image-item-deleted' |
  'video-item-updated' |
  'video-item-deleted' |
  'voice-item-updated' |
  'voice-item-deleted' |
  'image-used-updated' |
  'thumb-item-updated' |
  'thumb-item-deleted' |
  'custom-theme-changed' |
  'set-draft-cover-image' |
  'set-image-as-cover' |
  'delete-media-item' |
  'delete-draft-item' |
  'publish-draft-item' |
  'custom-theme-folder-changed' |
  'show-spinner' | 
  'hide-spinner'

  

type MessageListener = (data: unknown) => void;

export class MessageService {
    private listeners: Map<MSG_TYPE, MessageListener[]> = new Map();
  
    registerListener(msg: MSG_TYPE, listener: MessageListener) {
      const listeners = this.listeners.get(msg);
      if (listeners == undefined || listeners === null) {
        this.listeners.set(msg, [listener]);
      } else {
        listeners.push(listener);
      }
	  return () => this.unregisterListener(msg, listener);
    }

	unregisterListener(msg: MSG_TYPE, listener: MessageListener) {
		const listeners = this.listeners.get(msg);
		if (!listeners) {
			return;
		}
		const next = listeners.filter((item) => item !== listener);
		if (next.length === 0) {
			this.listeners.delete(msg);
			return;
		}
		this.listeners.set(msg, next);
	}
  
    sendMessage(msg: MSG_TYPE, data: unknown) {
      const listeners = this.listeners.get(msg)
      if (listeners == undefined || listeners === null) {
        return;
      } else {
        listeners.forEach(listener => listener(data));
      }
    }
  }
