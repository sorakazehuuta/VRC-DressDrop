// テンプレート登録用（npm run templates:prepare が一時的な Unity プロジェクトにコピーして使う）。
// unitypackage の Prefab をシーンに置いた状態のまま、表示されているメッシュとマテリアルを書き出す。
// Prefab の位置・大きさの変更、非表示にしたオブジェクト、差し替えたマテリアルがそのまま反映される。
// 出力: <out>/bake.json（メッシュとマテリアルの一覧）、<out>/mesh.bin（頂点・面のデータ）
using System;
using System.Collections.Generic;
using System.IO;
using UnityEditor;
using UnityEngine;

public static class VRPrintLabTemplateBaker
{
    [Serializable]
    class Submesh
    {
        public int indexOffset;
        public int indexCount;
        public string material;
    }

    [Serializable]
    class MeshEntry
    {
        public string name;
        public int vertexCount;
        public int positionOffset;
        public int normalOffset;
        public int uvOffset;
        public bool hasUv;
        public List<Submesh> submeshes = new List<Submesh>();
    }

    [Serializable]
    class MaterialEntry
    {
        public string name;
        public string path;
        public string shader;
        public Color color = Color.white;
        public float glossiness = 0.5f;
        public float metallic;
        // opaque / cutout / transparent
        public string mode = "opaque";
        public float cutoff = 0.5f;
        public Color emission = Color.black;
        public Vector2 textureScale = Vector2.one;
        public Vector2 textureOffset = Vector2.zero;
        public string texturePath = "";
    }

    [Serializable]
    class Output
    {
        public string prefab;
        // mesh.bin の先頭にある float の数（そのあとに面の頂点番号 int が続く）
        public int floatCount;
        public List<MeshEntry> meshes = new List<MeshEntry>();
        public List<MaterialEntry> materials = new List<MaterialEntry>();
        public List<string> warnings = new List<string>();
    }

    static string Arg(string name)
    {
        string[] args = Environment.GetCommandLineArgs();
        for (int i = 0; i < args.Length - 1; i++)
        {
            if (args[i] == name) return args[i + 1];
        }
        return null;
    }

    public static void Bake()
    {
        int code = 0;
        string outDir = Arg("-vrplOut");
        try
        {
            string prefabPath = Arg("-vrplPrefab");
            if (string.IsNullOrEmpty(prefabPath) || string.IsNullOrEmpty(outDir)) throw new Exception("-vrplPrefab と -vrplOut を指定してください");
            Directory.CreateDirectory(outDir);
            // unitypackage の中身は templates:prepare が Assets に展開済み（起動時の読み込みで取り込まれている）
            GameObject asset = AssetDatabase.LoadAssetAtPath<GameObject>(prefabPath);
            if (asset == null) throw new Exception("Prefab を読み込めません: " + prefabPath);
            GameObject root = (GameObject)PrefabUtility.InstantiatePrefab(asset);
            Write(root, prefabPath, outDir);
            UnityEngine.Object.DestroyImmediate(root);
        }
        catch (Exception e)
        {
            Debug.LogError("[VRPrintLabBake] " + e);
            if (!string.IsNullOrEmpty(outDir))
            {
                Directory.CreateDirectory(outDir);
                File.WriteAllText(Path.Combine(outDir, "error.txt"), e.Message);
            }
            code = 1;
        }
        EditorApplication.Exit(code);
    }

    static void Write(GameObject root, string prefabPath, string outDir)
    {
        var output = new Output { prefab = prefabPath };
        var materials = new Dictionary<Material, MaterialEntry>();
        var skipped = new HashSet<string>();
        using (var bin = new BinaryWriter(File.Create(Path.Combine(outDir, "mesh.bin"))))
        {
            int floatOffset = 0;
            var indexData = new List<int>();
            foreach (Renderer r in root.GetComponentsInChildren<Renderer>(true))
            {
                if (!r.enabled || !r.gameObject.activeInHierarchy) continue;
                Mesh mesh = null;
                Matrix4x4 matrix = r.transform.localToWorldMatrix;
                if (r is MeshRenderer)
                {
                    MeshFilter filter = r.GetComponent<MeshFilter>();
                    mesh = filter != null ? filter.sharedMesh : null;
                }
                else if (r is SkinnedMeshRenderer skinned)
                {
                    mesh = new Mesh();
                    skinned.BakeMesh(mesh, true);
                    matrix = Matrix4x4.TRS(r.transform.position, r.transform.rotation, Vector3.one);
                }
                else
                {
                    // パーティクル・線などはプレビューに出さない（購入した unitypackage には含まれる）
                    skipped.Add(r.GetType().Name + "（" + r.gameObject.name + "）");
                    continue;
                }
                if (mesh == null) continue;

                Vector3[] vertices = mesh.vertices;
                Vector3[] normals = mesh.normals;
                Vector2[] uvs = mesh.uv;
                Matrix4x4 normalMatrix = matrix.inverse.transpose;
                var entry = new MeshEntry { name = r.gameObject.name, vertexCount = vertices.Length, hasUv = uvs.Length == vertices.Length };

                entry.positionOffset = floatOffset;
                foreach (Vector3 v in vertices)
                {
                    Vector3 p = matrix.MultiplyPoint3x4(v);
                    bin.Write(p.x); bin.Write(p.y); bin.Write(p.z);
                }
                floatOffset += vertices.Length * 3;

                entry.normalOffset = floatOffset;
                for (int i = 0; i < vertices.Length; i++)
                {
                    Vector3 n = i < normals.Length ? normalMatrix.MultiplyVector(normals[i]).normalized : Vector3.up;
                    bin.Write(n.x); bin.Write(n.y); bin.Write(n.z);
                }
                floatOffset += vertices.Length * 3;

                entry.uvOffset = floatOffset;
                for (int i = 0; i < vertices.Length; i++)
                {
                    Vector2 uv = entry.hasUv ? uvs[i] : Vector2.zero;
                    bin.Write(uv.x); bin.Write(uv.y);
                }
                floatOffset += vertices.Length * 2;

                Material[] shared = r.sharedMaterials;
                for (int s = 0; s < mesh.subMeshCount; s++)
                {
                    if (mesh.GetTopology(s) != MeshTopology.Triangles) continue;
                    Material mat = shared.Length > 0 ? shared[Mathf.Min(s, shared.Length - 1)] : null;
                    if (mat == null) continue;
                    int[] tris = mesh.GetTriangles(s);
                    entry.submeshes.Add(new Submesh { indexOffset = indexData.Count, indexCount = tris.Length, material = Describe(mat, materials, output).name });
                    indexData.AddRange(tris);
                }
                if (entry.submeshes.Count > 0) output.meshes.Add(entry);
            }
            // 頂点データ（float）のあとに面のデータ（int）を続ける
            foreach (int i in indexData) bin.Write(i);
            output.floatCount = floatOffset;
        }
        foreach (string s in skipped) output.warnings.Add("プレビューに表示しないもの: " + s);
        output.materials.AddRange(materials.Values);
        File.WriteAllText(Path.Combine(outDir, "bake.json"), JsonUtility.ToJson(output, true));
    }

    static MaterialEntry Describe(Material mat, Dictionary<Material, MaterialEntry> cache, Output output)
    {
        if (cache.TryGetValue(mat, out MaterialEntry found)) return found;
        var m = new MaterialEntry { name = mat.name, path = AssetDatabase.GetAssetPath(mat), shader = mat.shader != null ? mat.shader.name : "" };
        if (mat.HasProperty("_Color")) m.color = mat.GetColor("_Color");
        else if (mat.HasProperty("_BaseColor")) m.color = mat.GetColor("_BaseColor");
        if (mat.HasProperty("_Glossiness")) m.glossiness = mat.GetFloat("_Glossiness");
        else if (mat.HasProperty("_Smoothness")) m.glossiness = mat.GetFloat("_Smoothness");
        if (mat.HasProperty("_Metallic")) m.metallic = mat.GetFloat("_Metallic");
        if (mat.HasProperty("_Cutoff")) m.cutoff = mat.GetFloat("_Cutoff");
        float standardMode = mat.HasProperty("_Mode") ? mat.GetFloat("_Mode") : -1;
        if (standardMode >= 2 || mat.renderQueue >= 3000) m.mode = "transparent";
        else if (standardMode == 1 || mat.IsKeywordEnabled("_ALPHATEST_ON") || mat.renderQueue >= 2450) m.mode = "cutout";
        if (mat.IsKeywordEnabled("_EMISSION") && mat.HasProperty("_EmissionColor")) m.emission = mat.GetColor("_EmissionColor");
        if (mat.HasProperty("_MainTex"))
        {
            m.textureScale = mat.mainTextureScale;
            m.textureOffset = mat.mainTextureOffset;
            if (mat.mainTexture != null)
            {
                m.texturePath = AssetDatabase.GetAssetPath(mat.mainTexture);
                if (!(m.texturePath.EndsWith(".png", StringComparison.OrdinalIgnoreCase) || m.texturePath.EndsWith(".jpg", StringComparison.OrdinalIgnoreCase) || m.texturePath.EndsWith(".jpeg", StringComparison.OrdinalIgnoreCase)))
                {
                    output.warnings.Add("PNG / JPEG 以外のテクスチャはプレビューに表示しません: " + m.texturePath);
                    m.texturePath = "";
                }
            }
        }
        cache[mat] = m;
        return m;
    }
}
