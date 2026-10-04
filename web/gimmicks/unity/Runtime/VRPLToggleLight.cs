#if UDONSHARP
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

namespace VRPrintLab
{
    // 触るたびにライトを点ける・消す（全員に同期）
    [UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
    public class VRPLToggleLight : UdonSharpBehaviour
    {
        public Light lightSource;
        public bool startOn;

        [UdonSynced] private bool on;
        private bool initialized;

        private void Start()
        {
            if (!initialized)
            {
                on = startOn;
                initialized = true;
            }
            Apply();
        }

        public override void Interact()
        {
            if (!Networking.IsOwner(gameObject)) Networking.SetOwner(Networking.LocalPlayer, gameObject);
            on = !on;
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
            if (lightSource != null) lightSource.enabled = on;
        }
    }
}
#endif
