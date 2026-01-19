/** 
 * Procesing the image data for a valid WeChat MP article for upload.
 * 
 */
import { App } from "obsidian";
import { $t } from 'src/lang/i18n';
import { fetchImageBlob, serializeNode } from 'src/utils/utils';
import { WechatClient } from './../wechat-api/wechat-client';
// 生成上传到微信素材库的文件名
function imageFileName(mime: string, fallbackExt?: string) {
    let type = "";
    if (mime && mime.includes("/")) {
        type = mime.split("/")[1] || "";
    }
    if (!type) {
        type = fallbackExt || "png";
    }
    return `image-${new Date().getTime()}.${type}`;
}

function getImageExtFromSrc(src: string): string | undefined {
    if (!src) return undefined;
    const clean = src.split("?")[0].split("#")[0];
    const match = clean.match(/\.([a-zA-Z0-9]+)$/);
    return match ? match[1].toLowerCase() : undefined;
}

function logUploadErrors(label: string, results: PromiseSettledResult<unknown>[]) {
    results.forEach((result) => {
        if (result.status === "rejected") {
            console.error(`${label}上传失败:`, result.reason);
        }
    });
}
export function svgToPng(svgData: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const dpr = window.devicePixelRatio || 1;
            canvas.width = img.width * dpr;
            canvas.height = img.height * dpr;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error($t('render.faild-canvas-context')));
                return;
            }
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error($t('render.failed-to-convert-canvas-to-blob')));
                }
            }, 'image/png');
        };

        img.onerror = (error) => {
            const message =
                error instanceof Error
                    ? error.message
                    : typeof error === "string"
                        ? error
                        : JSON.stringify(error);
            reject(new Error(message));
        };

         const encoder = new TextEncoder();
         const uint8Array = encoder.encode(svgData);
         const latin1String = String.fromCharCode.apply(null, uint8Array);
         img.src = `data:image/svg+xml;base64,${btoa(latin1String)}`;
    });
}

function dataURLtoBlob(dataUrl: string): Blob {
    const parts = dataUrl.split(';base64,');
	console.debug('parts:', parts);
	
    const contentType = parts[0].split(':')[1];
	console.debug('contentType', contentType);
	
    const raw = window.atob(parts[1]);
	console.debug('raw:', raw);
    const rawLength = raw.length;

    const uInt8Array = new Uint8Array(rawLength);

    for (let i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }
	console.debug('uInt8Array byteLength:', uInt8Array.byteLength);
    return new Blob([uInt8Array], { type: contentType });
}
export function getCanvasBlob(canvas: HTMLCanvasElement) {
    const pngDataUrl = canvas.toDataURL('image/png');
    const pngBlob = dataURLtoBlob(pngDataUrl);
    return pngBlob;
}

// 将 SVG 转成 PNG 并上传，替换为微信 CDN 图片
export async function uploadSVGs(root: HTMLElement, wechatClient: WechatClient){
    const svgs: SVGSVGElement[] = []
    root.querySelectorAll('svg').forEach(svg => {
        svgs.push(svg)
    })

    const uploadPromises = svgs.map(async (svg) => {
        const svgString = serializeNode(svg);
        if (svgString.length < 10000) {
            return
        }
        await svgToPng(svgString).then(async blob => {
            const res = await wechatClient.uploadMaterial(
                blob,
                imageFileName(blob.type, "png")
            );
            if (res && res.url) {
                const img = document.createElement("img");
                img.src = res.url;
                svg.replaceWith(img);
            } else {
                console.error(`upload svg failed.`);
            }
        })
    })
	
    const results = await Promise.allSettled(uploadPromises);
    logUploadErrors("SVG", results);
}
// 将 canvas 转为 PNG 上传，替换为微信 CDN 图片
export async function uploadCanvas(root:HTMLElement, wechatClient:WechatClient):Promise<void>{
    const canvases: HTMLCanvasElement[] = []
    
    root.querySelectorAll('canvas').forEach (canvas => {
        canvases.push(canvas)
    })
    
    const uploadPromises = canvases.map(async (canvas) => {
        const blob = getCanvasBlob(canvas);
        const res = await wechatClient.uploadMaterial(
            blob,
            imageFileName(blob.type, "png")
        );
        if (res && res.url) {
            const img = document.createElement("img");
            img.src = res.url;
            canvas.replaceWith(img);
        } else {
            console.error(`upload canvas failed.`);
        }
    })
    const results = await Promise.allSettled(uploadPromises);
    logUploadErrors("Canvas", results);
}

// 上传外链/本地图片，统一替换为微信可用的 URL
export async function uploadURLImage(
    root: HTMLElement,
    wechatClient: WechatClient,
    app?: App
): Promise<void> {
    const images: HTMLImageElement[] = []
    
    root.querySelectorAll('img').forEach (img => {
        images.push(img)
    })
    
    const uploadPromises = images.map(async (img) => {
        let blob:Blob|undefined 
        const fallbackExt = getImageExtFromSrc(img.src);
        if (img.src.includes('://mmbiz.qpic.cn/')){
            return;
        }
        else if (img.src.startsWith('data:image/')){
            blob = dataURLtoBlob(img.src);
        }else{
            try {
                blob = await fetchImageBlob(img.src, app)
            } catch (error) {
                console.error(`Error fetching image from ${img.src}:`, error);
                return;
            }
        }
        
        if (blob === undefined){
            return
            
        }else{

            await wechatClient.uploadMaterial(
                blob,
                imageFileName(blob.type, fallbackExt)
            ).then(res => {
                if (res && res.url){
                    img.src = res.url;
                }else{
                    console.error(`upload image failed.`);
                    
                }
            })
        }
    })
    const results = await Promise.allSettled(uploadPromises);
    logUploadErrors("图片", results);
}
// 发布前将 callout 正文写入内联颜色，保留主题色并避免微信覆盖
export function applyInlineCalloutTextColor(root: HTMLElement, baseColor?: string) {
    const articleRoot =
        root.classList.contains("one2mp")
            ? root
            : root.querySelector<HTMLElement>(".one2mp") ?? root;
    const sampleText = articleRoot.querySelector<HTMLElement>("p");
    const resolvedColor =
        baseColor ||
        (sampleText && window.getComputedStyle(sampleText).color) ||
        window.getComputedStyle(articleRoot).color ||
        "#333333";
    const apply = (el: HTMLElement) => {
        el.setCssProps({
            color: resolvedColor,
            opacity: "1",
            filter: "none",
        });
    };
    root.querySelectorAll<HTMLElement>(".one2mp-callout .callout-text").forEach(apply);
    root.querySelectorAll<HTMLElement>(".one2mp-callout .callout-content p, .one2mp-callout .callout-content li").forEach(apply);
}
// 兜底修复公众号内 callout 正文对比度
// export async function uploadURLBackgroundImage(root:HTMLElement, wechatClient:WechatClient):Promise<void>{
//     const bgEls: Map<string, HTMLElement>  = new Map()
//     root.querySelectorAll('*').forEach(el => {
// 		const style = window.getComputedStyle(el);
// 		const bg = style.getPropertyValue('background-image');
// 		console.log('uploadURLBGImage=>', bg);
// 		if (bg && bg !== 'none') {
// 			const match = bg.match(/url\(["']?(.*?)["']?\)/);
// 			if (match && match[1]) {
// 				bgEls.set(match[1], el as HTMLElement);
// 			}
// 		}
	
// 	});
//     console.log('-----------------------------------')
//     const uploadPromises = bgEls.forEach((async (el, src) => {
// 		log('uploadURLBGImage eachEls =>', src, el);
//         let blob:Blob|undefined 
//         if (src.includes('://mmbiz.qpic.cn/')){
//             return;
//         }
//         else if (src.startsWith('data:image/')){
// 			console.log('src=>', src);
			
//             blob = dataURLtoBlob(src);
//         }else{
//             // blob = await fetch(img.src).then(res => res.blob());
//             blob = await fetchImageBlob(src)
//         }
        
//         if (blob === undefined){
//             console.error(`upload image failed. blob is undefined.`);
//             return
            
//         }else{
// 			log('uploading blob...', blob.size, blob.type)
//             await wechatClient.uploadMaterial(blob, imageFileName(blob.type)).then(res => {
//                 if (res){
//                     el.style.setProperty("background-image", `url("${res.url}")`)
//                 }else{
//                     console.error(`upload image failed.`);
                    
//                 }
//             })
//         }
//     }))
//     // await Promise.all(uploadPromises)
// }
export async function uploadURLVideo(root:HTMLElement, wechatClient:WechatClient):Promise<void>{
    const videos: HTMLVideoElement[] = []
    
    root.querySelectorAll('video').forEach (video => {
        videos.push(video)
    })
    
    const uploadPromises = videos.map(async (video) => {
        let blob:Blob|undefined 
        if (video.src.includes('://mmbiz.qpic.cn/')){
            return;
        }
        else if (video.src.startsWith('data:image/')){
            blob = dataURLtoBlob(video.src);
        }else{
            blob = await fetchImageBlob(video.src)
        }
        
        if (blob === undefined){
            return
            
        }else{
			
            await wechatClient.uploadMaterial(blob, imageFileName(blob.type), 'video').then(async res => {
                if (res){
					const video_info = await wechatClient.getMaterialById(res.media_id)
					video.src = video_info.url
                }else{
                    console.error(`upload video failed.`);
                    
                }
            })
        }
    })
    const results = await Promise.allSettled(uploadPromises);
    logUploadErrors("视频", results);
}
