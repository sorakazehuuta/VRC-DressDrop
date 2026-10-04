#if UNITY_EDITOR
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;
using UnityEngine.Rendering;
using Object = UnityEngine.Object;

// VRPrintLab の unitypackage を読み込むと、各作品フォルダの VRPrintLab.json を読んで Prefab を組み立てる。
// UdonSharp / VRChat SDK の型は名前で探して使う（入っていない環境でもコンパイルエラーにしないため）
namespace VRPrintLab.EditorTools
{
    [Serializable]
    public class VRPLParam
    {
        public string key;
        public string type;
        public string value;
    }

    [Serializable]
    public class VRPLGimmick
    {
        public string slug;
        public string name;
        public string script;
        public string[] setup;
        public VRPLParam[] @params;
    }

    [Serializable]
    public class VRPLBuildConfig
    {
        public int version;
        public string name;
        public string folder;
        public string modelPath;
        public string prefabPath;
        public string magicCircleTexturePath;
        public VRPLGimmick[] gimmicks;
    }

    [InitializeOnLoad]
    public static class VRPrintLabPrefabBuilder
    {
        private const string RootFolder = "Assets/VRPrintLab";
        private const string ConfigFileName = "VRPrintLab.json";
        private const string Log = "[VRPrintLab] ";

        static VRPrintLabPrefabBuilder()
        {
            EditorApplication.delayCall += BuildMissing;
        }

        [MenuItem("Tools/VRPrintLab/Prefab をすべて作り直す")]
        private static void RebuildAll()
        {
            PrepareUdonSharp();
            foreach (string path in FindConfigs()) TryBuild(path);
        }

        // まだ Prefab がない作品だけ組み立てる（インポート直後に自動で実行される）
        private static void BuildMissing()
        {
            if (EditorApplication.isCompiling || EditorApplication.isUpdating)
            {
                EditorApplication.delayCall += BuildMissing;
                return;
            }
            if (EditorApplication.isPlayingOrWillChangePlaymode) return;
            List<string> pending = FindConfigs().Where(path =>
            {
                VRPLBuildConfig config = LoadConfig(path);
                return config != null && AssetDatabase.LoadAssetAtPath<GameObject>(config.prefabPath) == null;
            }).ToList();
            if (pending.Count == 0) return;
            PrepareUdonSharp();
            foreach (string path in pending) TryBuild(path);
        }

        // ギミックのスクリプトに対応する UdonSharpProgramAsset をそろえ、新しく作ったときはコンパイルが終わるまで待つ
        // （コンパイル前のスクリプトには設定値を書き込めないため）
        private static void PrepareUdonSharp()
        {
            Type behaviourType = FindType("UdonSharp.UdonSharpBehaviour");
            if (behaviourType == null) return;
            bool created = false;
            foreach (Assembly assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try
                {
                    types = assembly.GetTypes();
                }
                catch (ReflectionTypeLoadException e)
                {
                    types = e.Types.Where(t => t != null).ToArray();
                }
                foreach (Type type in types)
                {
                    if (type.Namespace == "VRPrintLab" && !type.IsAbstract && behaviourType.IsAssignableFrom(type)) created |= EnsureProgramAsset(type);
                }
            }
            if (!created) return;
            Type compiler = FindType("UdonSharp.Compiler.UdonSharpCompilerV1");
            MethodInfo compileSync = compiler != null ? compiler.GetMethod("CompileSync", BindingFlags.Public | BindingFlags.Static) : null;
            if (compileSync == null) return;
            try
            {
                compileSync.Invoke(null, compileSync.GetParameters().Select(p => p.HasDefaultValue ? p.DefaultValue : null).ToArray());
            }
            catch (Exception e)
            {
                Debug.LogWarning(Log + "UdonSharp のコンパイルに失敗しました: " + e.Message);
            }
        }

        private static IEnumerable<string> FindConfigs()
        {
            if (!AssetDatabase.IsValidFolder(RootFolder)) return Enumerable.Empty<string>();
            return AssetDatabase.FindAssets("VRPrintLab t:TextAsset", new[] { RootFolder })
                .Select(AssetDatabase.GUIDToAssetPath)
                .Where(p => Path.GetFileName(p) == ConfigFileName)
                .Distinct();
        }

        private static VRPLBuildConfig LoadConfig(string path)
        {
            TextAsset text = AssetDatabase.LoadAssetAtPath<TextAsset>(path);
            if (text == null) return null;
            try
            {
                return JsonUtility.FromJson<VRPLBuildConfig>(text.text);
            }
            catch (Exception e)
            {
                Debug.LogError(Log + path + " を読み込めませんでした: " + e.Message);
                return null;
            }
        }

        private static void TryBuild(string configPath)
        {
            VRPLBuildConfig config = LoadConfig(configPath);
            if (config == null) return;
            try
            {
                Build(config);
            }
            catch (Exception e)
            {
                Debug.LogError(Log + "Prefab を作れませんでした（" + config.name + "）。メニューの Tools > VRPrintLab > Prefab をすべて作り直す で再実行できます。\n" + e);
            }
        }

        // ---------------- 組み立て ----------------

        private class Context
        {
            public VRPLBuildConfig config;
            public GameObject root;
            public GameObject model;
            public Renderer[] renderers;
            public Bounds bounds;
            public Transform pivot;
        }

        private static void Build(VRPLBuildConfig config)
        {
            GameObject modelAsset = AssetDatabase.LoadAssetAtPath<GameObject>(config.modelPath);
            if (modelAsset == null)
            {
                Debug.LogWarning(Log + "モデルが見つかりません: " + config.modelPath);
                return;
            }

            GameObject root = new GameObject(config.name);
            try
            {
                GameObject model = (GameObject)PrefabUtility.InstantiatePrefab(modelAsset);
                model.name = "Model";
                model.transform.SetParent(root.transform, false);

                Context ctx = new Context
                {
                    config = config,
                    root = root,
                    model = model,
                    renderers = model.GetComponentsInChildren<Renderer>(true),
                };
                ctx.bounds = CalculateBounds(ctx.renderers, root.transform.position);

                BoxCollider collider = root.AddComponent<BoxCollider>();
                collider.center = ctx.bounds.center;
                collider.size = ctx.bounds.size;

                foreach (VRPLGimmick gimmick in config.gimmicks ?? new VRPLGimmick[0]) BuildGimmick(ctx, gimmick);

                PrefabUtility.SaveAsPrefabAsset(root, config.prefabPath);
                AssetDatabase.SaveAssets();
                Debug.Log(Log + "Prefab を作成しました: " + config.prefabPath);
            }
            finally
            {
                Object.DestroyImmediate(root);
            }
        }

        private static Bounds CalculateBounds(Renderer[] renderers, Vector3 fallback)
        {
            if (renderers.Length == 0) return new Bounds(fallback, Vector3.one * 0.5f);
            Bounds b = renderers[0].bounds;
            for (int i = 1; i < renderers.Length; i++) b.Encapsulate(renderers[i].bounds);
            return b;
        }

        private static void BuildGimmick(Context ctx, VRPLGimmick g)
        {
            Dictionary<string, VRPLParam> p = (g.@params ?? new VRPLParam[0]).Where(x => x != null && x.key != null).GroupBy(x => x.key).ToDictionary(x => x.Key, x => x.First());
            Dictionary<string, object> refs = new Dictionary<string, object> { { "renderers", ctx.renderers } };
            GameObject host = ctx.root;

            foreach (string step in g.setup ?? new string[0])
            {
                switch (step)
                {
                    case "switch":
                        host = CreateSwitch(ctx);
                        refs["target"] = ctx.model;
                        break;
                    case "pivot-center":
                        refs["pivot"] = EnsurePivot(ctx, false);
                        break;
                    case "pivot-bottom":
                        refs["pivot"] = EnsurePivot(ctx, true);
                        break;
                    case "particles-sparkle":
                        refs["particles"] = CreateParticles(ctx, "Sparkle", GetColor(p, "color", Color.white), GetFloat(p, "amount", 0f), false, GetBool(p, "startOn", true));
                        break;
                    case "particles-aura":
                        CreateParticles(ctx, "Aura", GetColor(p, "color", Color.white), 12f, true, true);
                        break;
                    case "light":
                        refs["lightSource"] = CreateLight(ctx, GetColor(p, "color", Color.white), GetFloat(p, "intensity", 1f), GetFloat(p, "range", 5f), GetBool(p, "startOn", false));
                        break;
                    case "trail":
                        CreateTrail(ctx, GetColor(p, "color", Color.white), GetFloat(p, "time", 1f), GetFloat(p, "width", 0.05f));
                        break;
                    case "transparent-materials":
                        CreateTransparentMaterials(ctx, GetFloat(p, "opacity", 40f) / 100f, refs);
                        break;
                    case "emission-static":
                        SetEmission(ctx, GetColor(p, "glowColor", Color.white) * GetFloat(p, "intensity", 1f));
                        break;
                    case "emission-dynamic":
                        SetEmission(ctx, Color.black);
                        break;
                    case "magic-circle":
                        CreateMagicCircle(ctx, GetColor(p, "color", Color.white), GetFloat(p, "size", 1.6f), GetFloat(p, "spinSpeed", 20f));
                        break;
                    case "pickup":
                        SetupPickup(ctx, GetBool(p, "physics", false));
                        break;
                    case "object-sync":
                        SetupObjectSync(ctx);
                        break;
                    default:
                        Debug.LogWarning(Log + "未対応の組み立て手順です: " + step + "（" + g.name + "）。VRPrintLab のパッケージを最新にしてください。");
                        break;
                }
            }

            if (!string.IsNullOrEmpty(g.script)) AttachScript(host, g.script, p, refs, g.name);
        }

        // ---------------- 各組み立て手順 ----------------

        private static Transform EnsurePivot(Context ctx, bool bottom)
        {
            if (ctx.pivot != null) return ctx.pivot;
            GameObject pivot = new GameObject("Pivot");
            pivot.transform.SetParent(ctx.root.transform, false);
            Vector3 center = ctx.bounds.center;
            pivot.transform.position = bottom ? new Vector3(center.x, ctx.bounds.min.y, center.z) : center;
            ctx.model.transform.SetParent(pivot.transform, true);
            ctx.pivot = pivot.transform;
            return ctx.pivot;
        }

        private static GameObject CreateSwitch(Context ctx)
        {
            GameObject sw = GameObject.CreatePrimitive(PrimitiveType.Cube);
            sw.name = "Switch";
            sw.transform.SetParent(ctx.root.transform, false);
            float size = Mathf.Clamp(ctx.bounds.size.magnitude * 0.06f, 0.06f, 0.3f);
            sw.transform.localScale = Vector3.one * size;
            sw.transform.position = new Vector3(ctx.bounds.max.x + size * 1.5f, ctx.bounds.min.y + size * 0.5f, ctx.bounds.center.z);
            Material mat = new Material(Shader.Find("Standard")) { color = new Color(0f, 0.635f, 0.612f) };
            sw.GetComponent<Renderer>().sharedMaterial = SaveAsset(mat, ctx.config.folder + "/Switch.mat");
            return sw;
        }

        private static ParticleSystem CreateParticles(Context ctx, string name, Color color, float rate, bool aura, bool playOnAwake)
        {
            GameObject go = new GameObject(name);
            go.transform.SetParent(ctx.root.transform, false);
            float extent = Mathf.Max(ctx.bounds.extents.x, ctx.bounds.extents.z);
            ParticleSystem ps = go.AddComponent<ParticleSystem>();
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);

            ParticleSystem.MainModule main = ps.main;
            main.loop = true;
            main.playOnAwake = playOnAwake;
            main.startLifetime = aura ? 2.5f : 1.5f;
            main.startSpeed = aura ? Mathf.Max(0.05f, ctx.bounds.size.y * 0.25f) : 0.05f;
            main.startSize = Mathf.Max(0.01f, ctx.bounds.size.magnitude * (aura ? 0.03f : 0.025f));
            main.startColor = color;
            main.maxParticles = 300;
            main.simulationSpace = ParticleSystemSimulationSpace.World;

            ParticleSystem.EmissionModule emission = ps.emission;
            emission.rateOverTime = rate;

            ParticleSystem.ShapeModule shape = ps.shape;
            if (aura)
            {
                go.transform.position = new Vector3(ctx.bounds.center.x, ctx.bounds.min.y, ctx.bounds.center.z);
                go.transform.rotation = Quaternion.Euler(-90f, 0f, 0f);
                shape.shapeType = ParticleSystemShapeType.Circle;
                shape.radius = extent * 0.9f;
            }
            else
            {
                go.transform.position = ctx.bounds.center;
                shape.shapeType = ParticleSystemShapeType.Box;
                shape.scale = ctx.bounds.size * 1.15f;
            }

            ParticleSystem.ColorOverLifetimeModule colorOverLifetime = ps.colorOverLifetime;
            colorOverLifetime.enabled = true;
            Gradient gradient = new Gradient();
            gradient.SetKeys(
                new[] { new GradientColorKey(Color.white, 0f), new GradientColorKey(Color.white, 1f) },
                new[] { new GradientAlphaKey(0f, 0f), new GradientAlphaKey(1f, 0.2f), new GradientAlphaKey(0f, 1f) });
            colorOverLifetime.color = gradient;

            ParticleSystemRenderer psRenderer = go.GetComponent<ParticleSystemRenderer>();
            psRenderer.sharedMaterial = AssetDatabase.GetBuiltinExtraResource<Material>("Default-ParticleSystem.mat");
            return ps;
        }

        private static Light CreateLight(Context ctx, Color color, float intensity, float range, bool startOn)
        {
            GameObject go = new GameObject("Light");
            go.transform.SetParent(ctx.root.transform, false);
            go.transform.position = ctx.bounds.center + Vector3.up * ctx.bounds.extents.y;
            Light light = go.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = color;
            light.intensity = intensity;
            light.range = range;
            light.shadows = LightShadows.None;
            light.enabled = startOn;
            return light;
        }

        private static void CreateTrail(Context ctx, Color color, float time, float width)
        {
            GameObject go = new GameObject("Trail");
            go.transform.SetParent(ctx.root.transform, false);
            go.transform.position = ctx.bounds.center;
            TrailRenderer trail = go.AddComponent<TrailRenderer>();
            trail.time = time;
            trail.widthMultiplier = width;
            trail.minVertexDistance = 0.02f;
            trail.shadowCastingMode = ShadowCastingMode.Off;
            Gradient gradient = new Gradient();
            gradient.SetKeys(
                new[] { new GradientColorKey(color, 0f), new GradientColorKey(color, 1f) },
                new[] { new GradientAlphaKey(1f, 0f), new GradientAlphaKey(0f, 1f) });
            trail.colorGradient = gradient;
            Material mat = new Material(Shader.Find("Sprites/Default"));
            trail.sharedMaterial = SaveAsset(mat, ctx.config.folder + "/Trail.mat");
        }

        private static List<Material> ModelMaterials(Context ctx)
        {
            List<Material> list = new List<Material>();
            foreach (Renderer r in ctx.renderers)
                foreach (Material m in r.sharedMaterials)
                    if (m != null && !list.Contains(m)) list.Add(m);
            return list;
        }

        private static void SetEmission(Context ctx, Color color)
        {
            foreach (Material m in ModelMaterials(ctx))
            {
                // 作品フォルダのマテリアルだけを書き換える（ほかの作品と共有しない）
                if (!AssetDatabase.GetAssetPath(m).StartsWith(ctx.config.folder)) continue;
                m.EnableKeyword("_EMISSION");
                m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.RealtimeEmissive;
                m.SetColor("_EmissionColor", color);
                Texture main = m.HasProperty("_MainTex") ? m.GetTexture("_MainTex") : null;
                if (main != null && m.HasProperty("_EmissionMap")) m.SetTexture("_EmissionMap", main);
                EditorUtility.SetDirty(m);
            }
        }

        private static void CreateTransparentMaterials(Context ctx, float opacity, Dictionary<string, object> refs)
        {
            List<Material> normal = new List<Material>();
            List<Material> transparent = new List<Material>();
            List<int> counts = new List<int>();
            Dictionary<Material, Material> made = new Dictionary<Material, Material>();
            foreach (Renderer r in ctx.renderers)
            {
                Material[] mats = r.sharedMaterials;
                counts.Add(mats.Length);
                foreach (Material m in mats)
                {
                    normal.Add(m);
                    if (m == null)
                    {
                        transparent.Add(null);
                        continue;
                    }
                    Material t;
                    if (!made.TryGetValue(m, out t))
                    {
                        t = new Material(m) { name = m.name + "_Transparent" };
                        t.SetFloat("_Mode", 2f);
                        t.SetInt("_SrcBlend", (int)BlendMode.SrcAlpha);
                        t.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
                        t.SetInt("_ZWrite", 0);
                        t.DisableKeyword("_ALPHATEST_ON");
                        t.EnableKeyword("_ALPHABLEND_ON");
                        t.DisableKeyword("_ALPHAPREMULTIPLY_ON");
                        t.SetOverrideTag("RenderType", "Transparent");
                        t.renderQueue = (int)RenderQueue.Transparent;
                        Color c = t.HasProperty("_Color") ? t.color : Color.white;
                        c.a = opacity;
                        if (t.HasProperty("_Color")) t.color = c;
                        t = SaveAsset(t, ctx.config.folder + "/" + m.name + "_Transparent.mat");
                        made[m] = t;
                    }
                    transparent.Add(t);
                }
            }
            refs["normalMaterials"] = normal.ToArray();
            refs["transparentMaterials"] = transparent.ToArray();
            refs["materialCounts"] = counts.ToArray();
        }

        private static void CreateMagicCircle(Context ctx, Color color, float size, float spinSpeed)
        {
            Texture2D texture = AssetDatabase.LoadAssetAtPath<Texture2D>(ctx.config.magicCircleTexturePath);
            GameObject circle = GameObject.CreatePrimitive(PrimitiveType.Quad);
            circle.name = "MagicCircle";
            Object.DestroyImmediate(circle.GetComponent<Collider>());
            circle.transform.SetParent(ctx.root.transform, false);
            circle.transform.position = new Vector3(ctx.bounds.center.x, ctx.bounds.min.y + 0.005f, ctx.bounds.center.z);
            circle.transform.rotation = Quaternion.Euler(90f, 0f, 0f);
            float width = Mathf.Max(ctx.bounds.size.x, ctx.bounds.size.z) * size;
            circle.transform.localScale = new Vector3(width, width, 1f);

            Shader shader = Shader.Find("Legacy Shaders/Particles/Additive");
            if (shader == null) shader = Shader.Find("Unlit/Transparent");
            Material mat = new Material(shader) { mainTexture = texture };
            if (mat.HasProperty("_TintColor")) mat.SetColor("_TintColor", color * 0.6f);
            Renderer renderer = circle.GetComponent<Renderer>();
            renderer.sharedMaterial = SaveAsset(mat, ctx.config.folder + "/MagicCircle.mat");
            renderer.shadowCastingMode = ShadowCastingMode.Off;

            // 魔法陣は回転スクリプト（VRPLSpin）で回す。UdonSharp がなければ止まったまま
            if (spinSpeed > 0f)
            {
                Dictionary<string, VRPLParam> p = new Dictionary<string, VRPLParam>
                {
                    { "speed", new VRPLParam { key = "speed", type = "number", value = spinSpeed.ToString(CultureInfo.InvariantCulture) } },
                    { "axis", new VRPLParam { key = "axis", type = "select", value = "2" } },
                };
                AttachScript(circle, "VRPLSpin", p, new Dictionary<string, object> { { "pivot", circle.transform } }, "魔法陣の回転");
            }
        }

        private static void SetupPickup(Context ctx, bool physics)
        {
            // Unity の GetComponent は「ない」ときに == null と等しい偽物を返すので ?? は使えない
            Rigidbody body = ctx.root.GetComponent<Rigidbody>();
            if (body == null) body = ctx.root.AddComponent<Rigidbody>();
            body.isKinematic = !physics;
            body.useGravity = physics;
            if (AddComponentByName(ctx.root, "VRC.SDK3.Components.VRCPickup") == null)
                Debug.LogWarning(Log + "VRC Pickup が見つかりません。VRChat SDK（Worlds）が入っているプロジェクトで使ってください。");
        }

        private static void SetupObjectSync(Context ctx)
        {
            if (ctx.root.GetComponent<Rigidbody>() == null)
            {
                Rigidbody body = ctx.root.AddComponent<Rigidbody>();
                body.isKinematic = true;
                body.useGravity = false;
            }
            AddComponentByName(ctx.root, "VRC.SDK3.Components.VRCObjectSync");
        }

        // ---------------- スクリプト（UdonSharp）の取り付け ----------------

        private static void AttachScript(GameObject host, string className, Dictionary<string, VRPLParam> p, Dictionary<string, object> refs, string label)
        {
            Type type = FindType("VRPrintLab." + className);
            if (type == null)
            {
                Debug.LogWarning(Log + "「" + label + "」のスクリプト（" + className + "）が見つかりません。VCC で UdonSharp を追加してから、Tools > VRPrintLab > Prefab をすべて作り直す を実行してください。");
                return;
            }
            EnsureProgramAsset(type);
            Component component = AddUdonSharpComponent(host, type);
            if (component == null)
            {
                Debug.LogWarning(Log + "「" + label + "」のスクリプトを取り付けられませんでした。");
                return;
            }

            foreach (FieldInfo field in type.GetFields(BindingFlags.Public | BindingFlags.Instance))
            {
                object value;
                if (refs.TryGetValue(field.Name, out value) && value != null && field.FieldType.IsInstanceOfType(value))
                {
                    field.SetValue(component, value);
                    continue;
                }
                VRPLParam param;
                if (p.TryGetValue(field.Name, out param))
                {
                    object converted = ConvertParam(param, field.FieldType);
                    if (converted != null) field.SetValue(component, converted);
                }
            }
            CopyProxyToUdon(component);
        }

        private static Component AddUdonSharpComponent(GameObject host, Type type)
        {
            Type undo = FindType("UdonSharpEditor.UdonSharpUndo");
            if (undo != null)
            {
                MethodInfo nonGeneric = undo.GetMethod("AddComponent", BindingFlags.Public | BindingFlags.Static, null, new[] { typeof(GameObject), typeof(Type) }, null);
                if (nonGeneric != null) return nonGeneric.Invoke(null, new object[] { host, type }) as Component;
                MethodInfo generic = undo.GetMethods(BindingFlags.Public | BindingFlags.Static)
                    .FirstOrDefault(m => m.Name == "AddComponent" && m.IsGenericMethodDefinition && m.GetParameters().Length == 1);
                if (generic != null) return generic.MakeGenericMethod(type).Invoke(null, new object[] { host }) as Component;
            }
            return host.AddComponent(type);
        }

        private static void CopyProxyToUdon(Component component)
        {
            Type util = FindType("UdonSharpEditor.UdonSharpEditorUtility");
            if (util == null) return;
            MethodInfo method = util.GetMethods(BindingFlags.Public | BindingFlags.Static)
                .Where(m => m.Name == "CopyProxyToUdon")
                .OrderBy(m => m.GetParameters().Length)
                .FirstOrDefault(m => m.GetParameters().Length >= 1 && m.GetParameters()[0].ParameterType.IsInstanceOfType(component));
            if (method == null) return;
            object[] args = method.GetParameters().Select((param, i) => i == 0 ? component : (param.HasDefaultValue ? param.DefaultValue : null)).ToArray();
            method.Invoke(null, args);
        }

        // UdonSharp のスクリプトには、対になる UdonSharpProgramAsset が必要
        private static bool EnsureProgramAsset(Type type)
        {
            Type programType = FindType("UdonSharp.UdonSharpProgramAsset");
            if (programType == null) return false;
            FieldInfo sourceField = programType.GetField("sourceCsScript");
            if (sourceField == null) return false;

            MonoScript script = null;
            string scriptPath = null;
            foreach (string guid in AssetDatabase.FindAssets("t:MonoScript " + type.Name))
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                MonoScript ms = AssetDatabase.LoadAssetAtPath<MonoScript>(path);
                if (ms != null && ms.GetClass() == type)
                {
                    script = ms;
                    scriptPath = path;
                    break;
                }
            }
            if (script == null) return false;

            foreach (string guid in AssetDatabase.FindAssets("t:" + programType.Name))
            {
                Object existing = AssetDatabase.LoadAssetAtPath(AssetDatabase.GUIDToAssetPath(guid), programType);
                if (existing != null && sourceField.GetValue(existing) as MonoScript == script) return false;
            }

            ScriptableObject asset = ScriptableObject.CreateInstance(programType);
            sourceField.SetValue(asset, script);
            // 新しいプログラムアセットは版が Unknown のままだと、UdonSharp の更新処理が走るまで設定値を書き込めない。
            // VRPrintLab のスクリプトは最新の書き方なので、最初から最新の版にしておく
            Type versionType = FindType("UdonSharp.UdonSharpProgramVersion");
            PropertyInfo versionProperty = programType.GetProperty("ScriptVersion");
            if (versionType != null && versionProperty != null && versionProperty.CanWrite)
                versionProperty.SetValue(asset, Enum.Parse(versionType, "CurrentVersion"));
            AssetDatabase.CreateAsset(asset, Path.ChangeExtension(scriptPath, ".asset"));
            AssetDatabase.SaveAssets();
            return true;
        }

        // ---------------- 共通 ----------------

        private static Type FindType(string fullName)
        {
            foreach (Assembly assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type type = assembly.GetType(fullName, false);
                if (type != null) return type;
            }
            return null;
        }

        private static Component AddComponentByName(GameObject go, string fullName)
        {
            Type type = FindType(fullName);
            if (type == null) return null;
            Component existing = go.GetComponent(type);
            return existing != null ? existing : go.AddComponent(type);
        }

        private static T SaveAsset<T>(T asset, string path) where T : Object
        {
            T existing = AssetDatabase.LoadAssetAtPath<T>(path);
            if (existing != null)
            {
                EditorUtility.CopySerialized(asset, existing);
                EditorUtility.SetDirty(existing);
                return existing;
            }
            AssetDatabase.CreateAsset(asset, path);
            return asset;
        }

        private static object ConvertParam(VRPLParam param, Type target)
        {
            string v = param.value ?? "";
            if (target == typeof(float))
            {
                float f;
                return float.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out f) ? (object)f : null;
            }
            if (target == typeof(int))
            {
                float f;
                return float.TryParse(v, NumberStyles.Float, CultureInfo.InvariantCulture, out f) ? (object)Mathf.RoundToInt(f) : null;
            }
            if (target == typeof(bool)) return v == "true";
            if (target == typeof(Color))
            {
                Color c;
                return ColorUtility.TryParseHtmlString(v, out c) ? (object)c : null;
            }
            if (target == typeof(string)) return v;
            return null;
        }

        private static float GetFloat(Dictionary<string, VRPLParam> p, string key, float fallback)
        {
            VRPLParam param;
            float f;
            return p.TryGetValue(key, out param) && float.TryParse(param.value, NumberStyles.Float, CultureInfo.InvariantCulture, out f) ? f : fallback;
        }

        private static bool GetBool(Dictionary<string, VRPLParam> p, string key, bool fallback)
        {
            VRPLParam param;
            return p.TryGetValue(key, out param) ? param.value == "true" : fallback;
        }

        private static Color GetColor(Dictionary<string, VRPLParam> p, string key, Color fallback)
        {
            VRPLParam param;
            Color c;
            return p.TryGetValue(key, out param) && ColorUtility.TryParseHtmlString(param.value, out c) ? c : fallback;
        }
    }
}
#endif
