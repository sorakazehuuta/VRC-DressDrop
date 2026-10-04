#if UDONSHARP
using UdonSharp;
using UnityEngine;
using VRC.SDKBase;

namespace VRPrintLab
{
    // 触るたびにパーティクルを出す・止める（全員に同期）
    [UdonBehaviourSyncMode(BehaviourSyncMode.Manual)]
    public class VRPLToggleParticles : UdonSharpBehaviour
    {
        public ParticleSystem particles;
        public bool startOn = true;

        [UdonSynced] private bool on = true;
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
            if (particles == null) return;
            if (on) particles.Play();
            else particles.Stop();
        }
    }
}
#endif
