use crate::services::knowledge::types::KnowledgeChunkDraft;

const DEFAULT_CHUNK_SIZE: usize = 900;
const MIN_BREAK_WINDOW: usize = 180;

pub fn chunk_text(content: &str) -> Vec<KnowledgeChunkDraft> {
    let normalized = content.replace("\r\n", "\n");
    let chars: Vec<char> = normalized.chars().collect();
    if chars.is_empty() {
        return Vec::new();
    }

    let mut drafts = Vec::new();
    let mut start = 0usize;
    let total = chars.len();
    let mut index = 0usize;

    while start < total {
        let hard_end = (start + DEFAULT_CHUNK_SIZE).min(total);
        let mut end = hard_end;

        if hard_end < total {
            let search_start = hard_end.saturating_sub(MIN_BREAK_WINDOW);
            for cursor in (search_start..hard_end).rev() {
                let ch = chars[cursor];
                if ch == '\n' || ch == '。' || ch == '.' || ch == '!' || ch == '?' {
                    end = cursor + 1;
                    break;
                }
            }
        }

        if end <= start {
            end = hard_end;
        }

        let chunk_text: String = chars[start..end].iter().collect();
        let chunk_text = chunk_text.trim().to_string();
        if !chunk_text.is_empty() {
            let anchor_text: String = chunk_text.chars().take(120).collect();
            drafts.push(KnowledgeChunkDraft {
                chunk_index: index,
                chunk_text: chunk_text.clone(),
                token_estimate: estimate_tokens(&chunk_text),
                start_offset: start,
                end_offset: end,
                anchor_text,
            });
            index += 1;
        }

        start = end;
    }

    drafts
}

fn estimate_tokens(content: &str) -> usize {
    let count = content.chars().count();
    ((count as f64) / 4.0).ceil() as usize
}
