#if UDONSHARP
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

namespace VRPrintLab
{
    // スイッチを触ると target の表示・非表示を切り替える（全員に同期）
    [UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
    public class VRPLToggleObject : UdonSharpBehaviour
    {
        public GameObject target;
        public bool startVisible = true;

        [UdonSynced] private bool visible = true;
        private bool initialized;

        private void Start()
        {
            if (!initialized)
            {
                visible = startVisible;
                initialized = true;
            }
            Apply();
        }

        public override void Interact()
        {
            if (!Networking.IsOwner(gameObject)) Networking.SetOwner(Networking.LocalPlayer, gameObject);
            visible = !visible;
            initialized = true;
            Apply();
            RequestSerialization();
        }

        public override void OnDeserialization()
        {
            initialized = true;
            Apply();
        }

        private void Apply()
        {
            if (target != null) target.SetActive(visible);
        }
    }
}
#endif
