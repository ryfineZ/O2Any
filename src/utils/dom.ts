export function serializeNode(node: Node): string {
	const serializer = new XMLSerializer();
	return serializer.serializeToString(node);
}

export function serializeChildren(node: Node): string {
	const serializer = new XMLSerializer();
	let html = "";
	node.childNodes.forEach((child) => {
		html += serializer.serializeToString(child);
	});
	return html;
}
