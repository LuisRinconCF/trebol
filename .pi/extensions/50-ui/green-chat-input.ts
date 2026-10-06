import { CustomEditor } from "@earendil-works/pi-coding-agent";

/** Give only the chat input border a green accent. */
export default function greenChatInput(pi: any) {
	pi.on("session_start", (_event: any, ctx: any) => {
		ctx.ui?.setEditorComponent?.((tui: any, theme: any, keybindings: any) => {
			const editor = new CustomEditor(tui, theme, keybindings);
			editor.borderColor = (text: string) => theme.fg("success", text);
			return editor;
		});
	});
}
