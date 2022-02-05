export interface Profile {
  id: any;
  time: any;
  releaseTime: any;
  type: any; // release, snapshot, old_version
  group: any; //mojang, ftb, ftb_third_party, pocketmine, etc.
  webui_desc: any;
  weight: number;
  downloaded: boolean;
  filename: any; // minecraft_server.1.8.8.jar
  version: any; // 1.8.8,
}

export const DEFAULT_PROFILE: Profile = {
  id: null,
  time: null,
  releaseTime: null,
  type: null, // release, snapshot, old_version
  group: null, //mojang, ftb, ftb_third_party, pocketmine, etc.
  webui_desc: null,
  weight: 0,
  downloaded: false,
  filename: null, // minecraft_server.1.8.8.jar
  version: null // 1.8.8,
};