#if UDONSHARP
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

namespace VRPrintLab
{
    // 触るたびに、ふつうのマテリアルと半透明のマテリアルを入れ替える（全員に同期）
    // normalMaterials / transparentMaterials は全レンダラーのマテリアルを順に並べたもの。materialCounts は各レンダラーの数
    [UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
    public class VRPLToggleTransparency : UdonSharpBehaviour
    {
        public Renderer[] renderers;
        public Material[] normalMaterials;
        public Material[] transparentMaterials;
        public int[] materialCounts;

        [UdonSynced] private bool transparent;

        private void Start()
        {
            Apply();
        }

        public override void Interact()
        {
            if (!Networking.IsOwner(gameObject)) Networking.SetOwner(Networking.LocalPlayer, gameObject);
            transparent = !transparent;
            Apply();
            RequestSerialization();
        }

        public override void OnDeserialization()
        {
            Apply();
        }

        private void Apply()
        {
            if (renderers == null || materialCounts == null) return;
            int index = 0;
            for (int i = 0; i < renderers.Length && i < materialCounts.Length; i++)
            {
                int count = materialCounts[i];
                Material[] mats = new Material[count];
                for (int j = 0; j < count; j++)
                {
                    mats[j] = transparent ? transparentMaterials[index + j] : normalMaterials[index + j];
                }
                if (renderers[i] != null) renderers[i].sharedMaterials = mats;
                index += count;
            }
        }
    }
}
#endif
