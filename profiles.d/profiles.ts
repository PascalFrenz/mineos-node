import {BungeeCord} from "./bungeecord"
import {Cuberite} from "./cuberite";
import {Forge} from "./forge";
import {FTB_Legacy} from "./ftb_legacy";

export interface ProfileDefinition {
    name: string;
    request_args: {
        url: string;
        json: boolean;
    };
    handler: (profile_dir, body, callback) => void;
    postdownload?: (profile_dir, dest_path, callback) => void;
}

const profileManifests: Record<string, ProfileDefinition> = {
    bungeecord: BungeeCord,
    cuberite: Cuberite,
    forge: Forge,
    ftb_legacy: FTB_Legacy
};
export default {
    profile_manifests: profileManifests
}