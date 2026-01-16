import { requestUrl } from "obsidian";

export interface DualIps {
    direct?: string;
    proxy?: string;
}

export async function getPublicIpAddress(): Promise<string> {
    const ips = await getDualIps();
    return ips.proxy || ips.direct || "";
}

export async function getDualIps(): Promise<DualIps> {
    const fetchProxyIp = async () => {
        try {
            // Foreign service, likely to go through proxy if enabled
            const response = await requestUrl('https://api.ipify.org?format=json');
            return response.json.ip;
        } catch (e) {
            console.warn("Failed to fetch proxy IP", e);
            return undefined;
        }
    };

    const fetchDirectIp = async () => {
        try {
            // Domestic service, likely to be routed directly in split-tunneling scenarios
            // ipip.net returns JSON with data.ip
            const response = await requestUrl('https://myip.ipip.net/json');
            return response.json.data.ip;
        } catch (e) {
            console.warn("Failed to fetch direct IP", e);
            return undefined;
        }
    };

    const [proxy, direct] = await Promise.all([fetchProxyIp(), fetchDirectIp()]);
    return { proxy, direct };
}


