import type {AccountabilityInput} from "./accountability";
import type {TrustStore} from "./trusted-release";
// References to editable demos are not an approval or evidence provenance chain.
export function validateAccountabilityLinks(input:AccountabilityInput,trust:TrustStore){
 const release=input.releaseId?trust.releases.find(r=>r.id===input.releaseId):undefined;
 const replay=input.replayId?trust.replays.find(r=>r.id===input.replayId):undefined;
 if(input.releaseId&&(!release||release.codeId!==input.codeId))throw new Error("Selected local release must exist and match the code reference.");
 if(input.replayId&&(!replay||replay.codeId!==input.codeId||(input.archiveId&&replay.caseId!==input.archiveId)||(release&&replay.version!==release.version)))throw new Error("Selected replay must exist and match code, archive and release version.");
 if(release?.replayId&&release.replayId!==input.replayId)throw new Error("The incident replay must match the release's recorded replay reference.");
}