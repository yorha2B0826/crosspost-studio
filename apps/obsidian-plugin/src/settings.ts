import type { ThemeId } from "@crosspost/core";
import type { JobState, PlatformId } from "@crosspost/protocol";
import { Notice, PluginSettingTab, SecretComponent, Setting } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";

import type CrosspostStudioPlugin from "./main.js";

export interface CrosspostSettings {
  bridgePort: number;
  customCssPath: string;
  customCssSnippet: string;
  pairingSecretId: string;
  publicationStates: Record<
    string,
    Partial<
      Record<
        PlatformId,
        {
          message: string;
          state: JobState;
          updatedAt: string;
        }
      >
    >
  >;
  theme: ThemeId;
  wechatAppId: string;
  wechatAppSecretId: string;
}

export const DEFAULT_SETTINGS: CrosspostSettings = {
  bridgePort: 27_124,
  customCssPath: "",
  customCssSnippet: "",
  pairingSecretId: "crosspost-studio-bridge-key",
  publicationStates: {},
  theme: "minimal",
  wechatAppId: "",
  wechatAppSecretId: "crosspost-wechat-app-secret"
};

type SearchableSettingKey =
  | "bridgePort"
  | "customCssPath"
  | "customCssSnippet"
  | "theme"
  | "wechatAppId";

export class CrosspostSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: CrosspostStudioPlugin) {
    super(plugin.app, plugin);
  }

  // Obsidian 1.11+ settings search: getSettingDefinitions() provides declarative
  // descriptors for the settings search index. display() handles full rendering
  // because interactive controls (SecretComponent, copy-pairing-key) cannot be
  // expressed declaratively. Keep both in sync when adding/removing fields.
  getSettingDefinitions(): SettingDefinitionItem<SearchableSettingKey>[] {
    return [
      {
        heading: "排版",
        items: [
          {
            control: {
              key: "theme",
              options: {
                academic: "学术",
                bold: "粗犷",
                dark: "暗夜",
                elegant: "典雅",
                fresh: "清新",
                minimal: "简约",
                ocean: "海洋",
                tech: "科技",
                warm: "温暖",
                zen: "禅意"
              },
              type: "dropdown"
            },
            desc: "笔记未指定主题时使用的排版样式。",
            name: "默认主题"
          },
          {
            control: {
              filter: (file) => file.extension.toLowerCase() === "css",
              key: "customCssPath",
              placeholder: "Meta/crosspost-theme.css",
              type: "file"
            },
            desc: "可选：仓库内的 CSS 文件。导出时只保留安全且限定范围的属性。",
            name: "自定义 CSS 文件"
          },
          {
            control: {
              key: "customCssSnippet",
              placeholder: "#crosspost-root h1 { font-size: 2em; }",
              type: "textarea"
            },
            desc: "直接撰写 CSS 片段，会与文件 CSS 合并。优先级高于预设主题。",
            name: "内联 CSS 片段"
          }
        ],
        type: "group"
      },
      {
        heading: "微信公众号",
        items: [
          {
            control: {
              key: "wechatAppId",
              type: "text"
            },
            desc: "公众号的公开标识，不属于敏感凭据。",
            name: "微信公众号应用 ID"
          },
          {
            desc: "选择或创建 Obsidian 加密密钥；明文不会写入 data.json。",
            name: "微信公众号应用密钥",
            render: (setting) => {
              setting.addComponent(
                (element) =>
                  new SecretComponent(this.app, element)
                    .setValue(this.plugin.settings.wechatAppSecretId)
                    .onChange(async (value) => {
                      if (value) {
                        this.plugin.settings.wechatAppSecretId = value;
                        await this.plugin.saveSettings();
                      }
                    })
              );
            }
          }
        ],
        type: "group"
      },
      {
        heading: "浏览器扩展",
        items: [
          {
            control: {
              key: "bridgePort",
              max: 65_535,
              min: 1_024,
              step: 1,
              type: "number",
              validate: (value) =>
                Number.isInteger(value)
                  ? undefined
                  : "请输入 1024 至 65535 之间的整数。"
            },
            desc: "仅监听 127.0.0.1，供本机浏览器扩展连接。",
            name: "本地桥接端口"
          },
          {
            desc: "只复制到本机浏览器扩展，用于验证本地连接。",
            name: "浏览器扩展配对密钥",
            render: (setting) => {
              setting.addButton((button) => {
                button.setButtonText("复制配对密钥").onClick(async () => {
                  await this.copyPairingSecret();
                });
              });
            }
          }
        ],
        type: "group"
      }
    ];
  }

  getControlValue(key: SearchableSettingKey): unknown {
    return this.plugin.settings[key];
  }

  async setControlValue(
    key: SearchableSettingKey,
    value: unknown
  ): Promise<void> {
    if (key === "bridgePort") {
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 1_024 &&
        value <= 65_535
      ) {
        this.plugin.settings.bridgePort = value;
      }
    } else if (key === "theme") {
      const validThemes = new Set([
        "academic",
        "bold",
        "dark",
        "elegant",
        "fresh",
        "minimal",
        "ocean",
        "tech",
        "warm",
        "zen"
      ]);
      if (validThemes.has(value as ThemeId)) {
        this.plugin.settings.theme = value as ThemeId;
      }
    } else if (typeof value === "string") {
      this.plugin.settings[key] = value.trim();
    }
    await this.plugin.saveSettings();
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "配置默认排版、微信公众号凭据和本机浏览器桥接。所有正文只在你主动保存草稿时传输。"
    });
    new Setting(containerEl).setName("排版").setHeading();

    new Setting(containerEl)
      .setName("默认主题")
      .setDesc("笔记未指定主题时使用的排版样式。")
      .addDropdown((dropdown) => {
        dropdown
          .addOptions({
            academic: "学术",
            bold: "粗犷",
            dark: "暗夜",
            elegant: "典雅",
            fresh: "清新",
            minimal: "简约",
            ocean: "海洋",
            tech: "科技",
            warm: "温暖",
            zen: "禅意"
          })
          .setValue(this.plugin.settings.theme)
          .onChange(async (value) => {
            this.plugin.settings.theme = value as ThemeId;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("自定义 CSS 文件")
      .setDesc("可选：仓库内的 CSS 路径。导出时只保留安全且限定范围的属性。")
      .addText((text) => {
        text
          .setPlaceholder("Meta/crosspost-theme.css")
          .setValue(this.plugin.settings.customCssPath)
          .onChange(async (value) => {
            this.plugin.settings.customCssPath = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("内联 CSS 片段")
      .setDesc("直接在此撰写 CSS。优先级高于文件与预设主题。仅接受 #crosspost-root 作用域内的安全属性。")
      .addTextArea((text) => {
        text
          .setPlaceholder(
            "#crosspost-root h1 { font-size: 2em; color: #4a90d9; }\n#crosspost-root blockquote { border-left-color: #e8c84a; }"
          )
          .setValue(this.plugin.settings.customCssSnippet)
          .onChange(async (value) => {
            this.plugin.settings.customCssSnippet = value;
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 6;
        text.inputEl.addClass("crosspost-css-snippet-field");
      });

    new Setting(containerEl).setName("微信公众号").setHeading();

    new Setting(containerEl)
      .setName("微信公众号应用 ID")
      .setDesc("公众号的公开标识，不属于敏感凭据。")
      .addText((text) => {
        text.setValue(this.plugin.settings.wechatAppId).onChange(async (value) => {
          this.plugin.settings.wechatAppId = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("微信公众号应用密钥")
      .setDesc("选择或创建 Obsidian 加密密钥；明文不会写入 data.json。")
      .addComponent((element) =>
        new SecretComponent(this.app, element)
          .setValue(this.plugin.settings.wechatAppSecretId)
          .onChange(async (value) => {
            if (value) {
              this.plugin.settings.wechatAppSecretId = value;
              await this.plugin.saveSettings();
            }
          })
      );

    new Setting(containerEl)
      .setName("测试微信连接")
      .setDesc("验证 appid 和 appsecret 是否能正常获取 access token。")
      .addButton((button) => {
        button.setButtonText("测试连接").onClick(async () => {
          button.setButtonText("正在测试…");
          button.setDisabled(true);
          try {
            const appId = this.plugin.settings.wechatAppId;
            const appSecret = this.app.secretStorage.getSecret(
              this.plugin.settings.wechatAppSecretId
            );
            if (!appSecret) {
              new Notice("请先选择或创建微信公众号应用密钥。");
              return;
            }
            const result = await this.plugin.weChat.testConnection(appId, appSecret);
            new Notice(result.ok ? `✓ ${result.message}` : `✗ ${result.message}`);
          } catch (error) {
            new Notice(
              `微信连接测试失败: ${error instanceof Error ? error.message : "未知错误"}`
            );
          } finally {
            button.setButtonText("测试连接");
            button.setDisabled(false);
          }
        });
      });

    new Setting(containerEl).setName("浏览器扩展").setHeading();

    new Setting(containerEl)
      .setName("本地桥接端口")
      .setDesc("仅监听 127.0.0.1，供本机浏览器扩展连接。")
      .addText((text) => {
        text.setValue(String(this.plugin.settings.bridgePort)).onChange(async (value) => {
          const port = Number.parseInt(value, 10);
          if (Number.isInteger(port) && port >= 1_024 && port <= 65_535) {
            this.plugin.settings.bridgePort = port;
            await this.plugin.saveSettings();
          }
        });
      });

    new Setting(containerEl)
      .setName("浏览器扩展配对密钥")
      .setDesc("只复制到本机浏览器扩展，用于验证本地连接。")
      .addButton((button) => {
        button.setButtonText("复制配对密钥").onClick(async () => {
          await this.copyPairingSecret();
        });
      });
  }

  private async copyPairingSecret(): Promise<void> {
    const secret = this.app.secretStorage.getSecret(
      this.plugin.settings.pairingSecretId
    );
    if (!secret) {
      new Notice("配对密钥不可用，请重新加载插件。");
      return;
    }
    await navigator.clipboard.writeText(secret);
    new Notice("配对密钥已复制。");
  }
}
