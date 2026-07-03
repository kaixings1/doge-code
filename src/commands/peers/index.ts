// Peer sessions - manage collaborative coding sessions with other users
import type { Command } from '../../commands.js'
import { getIsNonInteractiveSession } from '../../bootstrap/state.js'

const call = async () => {
  return {
    type: 'text' as const,
    value: ['äºŽç•â€œPeer Sessions ç®¡ç†','','Peer Sessions è§Žè·®ç®¡çº²è¯ç¨†å‡½ç«‘å¯æˆ—,'','Ydlsšy§{¨®Y»î(
"rÂr÷VW'2–çf—FRÆVÖ–ÃâÒiÈžX[žyXòrÂr÷VW'2Æ—7BÒšXÙ^{èy¨NûÉòrÂr÷VW'2ÆVfRÒ¹è>yJ~{¨þi{nY›nY»î(
"rÂr÷VW'27FGW2Ò{éy¨NûÉòrÂrrÂr~Y(ÎK‰®ZJ~K‰®ZJrrÂ~(hžièiÈ¾Y»î(	ÒrÂr{éy¨NûÉòrÂryéy¨NûÉòrÂryéy¨NûÉòrÂryéy¨NûÉòrÂrrÂr~XÉnzêy¨Nˆz®zêy¨BrÂrrÂ~K»nZèâîXj.K©®Y»î(
"rÅÒæ¦ö–â‚uÆâr’À¢Ð§Ð ¦6öç7BVW'2Ò°¢G—S¢vÆö6ÂrÀ¢æÖS¢wVW'2rÀ¢FW67&—F–öã¢~Xùy¨NihnXûhŠŽyJòrÀ¢—4Væ&ÆVC¢‚’ÓâvWD—4æöä–çFW&7F—fU6W76–öâ‚’À¢7W÷'G4æöä–çFW&7F—fS¢G'VRÀ¢ÆöC¢‚’Óâ&öÖ—6Rç&W6öÇfR‡²6ÆÂÒ’À§Ò6F—6f–W26öÖÖæ@ ¦W‡÷'BFVfVÇBVW'0 