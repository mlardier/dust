use crate::providers::llm::Tokens;
use crate::providers::llm::{LLMGeneration, LLM};
use crate::providers::provider::{ModelError, ModelErrorRetryOptions, Provider, ProviderID};
use crate::run::Credentials;
use crate::utils;
use anyhow::{anyhow, Result};
use async_trait::async_trait;
use hyper::{body::Buf, Body, Client, Method, Request, Uri};
use hyper_tls::HttpsConnector;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::io::prelude::*;
use std::time::Duration;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct TokenDataItem {
    pub token: String,
    pub logprob: Option<f32>
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TokenData {
    pub generated_token: TokenDataItem,
    pub top_tokens: Option<Vec<TokenDataItem>>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct CompletionData {
    pub text: String,
    pub tokens: Vec<TokenData>
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Completion {
    pub data: CompletionData,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Response {
    pub id: String,
    pub prompt: CompletionData,
    pub completions: Vec<Completion>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Error {
    pub detail: String,
}

pub struct Ai21LLM {
    id: String,
    api_key: Option<String>,
}

impl Ai21LLM {
    pub fn new(id: String) -> Self {
        Ai21LLM { id, api_key: None }
    }

    fn uri(&self) -> Result<Uri> {
        Ok(format!("https://api.ai21.com/studio/v1/{}/complete",self.id.clone()).parse::<Uri>()?)
    }

    async fn generate(
        &self,
        prompt: &str,
        num_results: i32,
        max_tokens: i32,
        min_tokens: i32,
        temperature: f32,
        top_p: f32,
        stop: &Vec<String>,
        top_k_return: i32,
        frequency_penalty: f32,
        presence_penalty: f32,
    ) -> Result<Response> {
        assert!(self.api_key.is_some());

        let https = HttpsConnector::new();
        let cli = Client::builder().build::<_, hyper::Body>(https);

        let req = Request::builder()
            .method(Method::POST)
            .uri(self.uri()?)
            .header("Content-Type", "application/json")
            .header("Accept", "application/json")
            .header(
                "Authorization",
                format!("Bearer {}", self.api_key.clone().unwrap()),
            )
            .body(Body::from(
                json!({
                    "prompt": prompt,
                    "numResults": num_results,
                    "maxTokens": max_tokens,
                    "minTokens": min_tokens,
                    "temperature": temperature,
                    "topP": top_p,
                    "stopSequences": stop,
                    "topKReturn": top_k_return,
                    "frequency_penalty": {
                        "scale": frequency_penalty,
                    },
                    "presence_penalty": {
                        "scale": presence_penalty,
                    }
                })
                .to_string(),
            ))?;

        let res = cli.request(req).await?;
        let status = res.status();
        let body = hyper::body::aggregate(res).await?;
        let mut b: Vec<u8> = vec![];
        body.reader().read_to_end(&mut b)?;
        let c: &[u8] = &b;

        let response = match status {
            hyper::StatusCode::OK => {
                let response: Response = serde_json::from_slice(c)?;
                Ok(response)
            }
            hyper::StatusCode::TOO_MANY_REQUESTS => {
                let error: Error = serde_json::from_slice(c).unwrap_or(Error {
                    detail: "Too many requests".to_string(),
                });
                Err(ModelError {
                    message: format!("Ai21APIError: {}", error.detail),
                    retryable: Some(ModelErrorRetryOptions {
                        sleep: Duration::from_millis(2000),
                        factor: 2,
                        retries: 8,
                    }),
                })
            }
            _ => {
                let error: Error = serde_json::from_slice(c)?;
                Err(ModelError {
                    message: format!("Ai21APIError: {}", error.detail),
                    retryable: None,
                })
            }
        }?;
        Ok(response)
    }
}

#[async_trait]
impl LLM for Ai21LLM {
    fn id(&self) -> String {
        self.id.clone()
    }

    async fn initialize(&mut self, credentials: Credentials) -> Result<()> {
        match credentials.get("AI21_API_KEY") {
            Some(api_key) => {
                self.api_key = Some(api_key.clone());
            }
            None => match tokio::task::spawn_blocking(|| std::env::var("AI21_API_KEY")).await? {
                Ok(key) => {
                    self.api_key = Some(key);
                }
                Err(_) => Err(anyhow!(
                    "Credentials or environment variable `AI21_API_KEY` is not set."
                ))?,
            },
        }
        Ok(())
    }

    async fn generate(
        &self,
        prompt: &str,
        max_tokens: Option<i32>,
        temperature: f32,
        _n: usize,
        stop: &Vec<String>,
        frequency_penalty: Option<f32>,
        presence_penalty: Option<f32>,
        top_p: Option<f32>,
        _top_logprobs: Option<i32>,
        _extras: Option<Value>,
        _event_sender: Option<UnboundedSender<Value>>,
    ) -> Result<LLMGeneration> {
        let r = self
            .generate(
                prompt.clone(),
                1, // num_results
                match max_tokens {
                    Some(f) => f,
                    None => 256,
                },
                0, // min_tokens
                temperature,
                match top_p {
                    Some(f) => f,
                    None => 1.0,
                },
                stop,
                0, // top_k_return
                match frequency_penalty {
                    Some(f) => f,
                    None => 0.0,
                },
                match presence_penalty {
                    Some(p) => p,
                    None => 0.0,
                }
            )
            .await?;

        // println!("RESPONSE: {:?}", r);

        assert!(r.completions.len() > 0);

        Ok(LLMGeneration {
            created: utils::now(),
            provider: ProviderID::Ai21.to_string(),
            model: self.id.clone(),
            completions: r
                .completions
                .iter()
                .map(|g| {
                    Tokens {
                        text: g.data.text.clone(),
                        tokens: Some(g.data.tokens.iter().map(|l| l.generated_token.token.clone()).collect()),
                        logprobs: Some(g.data.tokens.iter().map(|l| l.generated_token.logprob).collect()),
                        top_logprobs: None,
                    }
                })
                .collect::<Vec<_>>(),
            prompt: Tokens {
                text: r.prompt.text.clone(),
                tokens: Some(r.prompt.tokens.iter().map(|l| l.generated_token.token.clone()).collect()),
                logprobs: Some(r.prompt.tokens.iter().map(|l| l.generated_token.logprob).collect()),
                top_logprobs: None,
            },
        })
    }
}

pub struct Ai21Provider {}

impl Ai21Provider {
    pub fn new() -> Self {
        Ai21Provider {}
    }
}

#[async_trait]
impl Provider for Ai21Provider {
    fn id(&self) -> ProviderID {
        ProviderID::Ai21
    }

    fn setup(&self) -> Result<()> {
        utils::info("Setting up AI21:");
        utils::info("");
        utils::info(
            "To use AI21's models, you must set the environment variable `AI21_API_KEY`.",
        );
        utils::info("Your API key can be found at `https://os.cohere.ai`.");
        utils::info("");
        utils::info("Once ready you can check your setup with `dust provider test cohere`");

        Ok(())
    }

    async fn test(&self) -> Result<()> {
        if !utils::confirm(
            "You are about to make a request for 1 token to `j1-grande` on the AI21 API.",
        )? {
            Err(anyhow!("User aborted AI21 test."))?;
        }

        let mut llm = self.llm(String::from("j1-grande"));
        llm.initialize(Credentials::new()).await?;

        let _ = llm
            .generate(
                "Hello 😊",
                Some(1),
                0.7,
                1,
                &vec![],
                None,
                None,
                None,
                None,
                None,
                None,
            )
            .await?;

        utils::done("Test successfully completed! AI21 is ready to use.");

        Ok(())
    }

    fn llm(&self, id: String) -> Box<dyn LLM + Sync + Send> {
        Box::new(Ai21LLM::new(id))
    }
}
